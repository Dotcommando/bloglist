import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Connection } from 'mongoose';

import { AddonUpdateMode, AddonUpdatePhase, type IAddonUpdateProposal, type IAddonUpdateState }
  from '../../../../domain/addons/addon-update.js';
import type { IBinaryContent } from '../../../../domain/shared/binary-content.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import type { IAddonUpdatesPort } from '../../../../ports/outbound/addons/addon-updates.port.js';
import { checked, fileHash, missing } from '../../backup/files/dump-files.js';
import { MongooseAddonUpdateGate } from '../../persistence/mongoose/addons/addon-update-gate.adapter.js';
import { applyMigrations, migrationReceiptCollection, readMigrations } from '../../persistence/mongoose/migrations.js';
import type { IAddonPackageManifest } from './addon-package.types.js';
import { extractAddonArchive, maximumAddonArchiveBytes } from './addon-package-archive.js';
import { packageObject, readAddonPackageManifest } from './addon-package-manifest.js';
import { AddonPackageRegistry } from './addon-package-registry.js';
import { assertCompatibleAddonSchema } from './addon-schema-compatibility.js';

function newer(candidate: string, previous: string): boolean {
  const left = candidate.split('.').map(Number);
  const right = previous.split('.').map(Number);
  const index = left.findIndex((value, position) => value !== right[position]);

  return index >= 0 && left[index]! > right[index]!;
}

import { moveAddonDirectory } from './addon-directory-move.js';

/** The coordinator validates/stages bytes and owns selection, but never evaluates package code. */
export class LiveAddonUpdates implements IAddonUpdatesPort {
  private readonly gate: MongooseAddonUpdateGate;

  constructor(private readonly root: string, private readonly connection: Connection,
    private readonly packages: AddonPackageRegistry,
    private readonly restartProcesses: (addonKey: string) => Promise<readonly string[]>,
    private readonly reserveProcesses: () => Promise<() => Promise<void>>) {
    this.gate = new MongooseAddonUpdateGate(connection);
  }

  reserve(): Promise<() => Promise<void>> {
    return this.reserveProcesses();
  }

  prepare(directory: string): Promise<IAddonUpdateProposal>;

  prepare(directory: string, expectedAddonKey: string): Promise<IAddonUpdateProposal | null>;

  async prepare(directory: string, expectedAddonKey?: string): Promise<IAddonUpdateProposal | null> {
    await this.packages.refresh();
    const manifest = await AddonPackageRegistry.validateSnapshotPackage(directory, this.packages.dumpMetadata(), true);
    const key = manifest.definition.addonKey;

    if (expectedAddonKey !== undefined && key !== expectedAddonKey) {
      throw new BusinessError(BusinessErrorCode.Validation, 'The repository package belongs to a different add-on');
    }

    const selected = await this.selected(key);
    const previousDirectory = await checked(this.root, key + '/' + selected);
    const previous = readAddonPackageManifest(JSON.parse(await readFile(
      await checked(previousDirectory, 'addon.runtime.json'), 'utf8')));
    const isNewer = newer(manifest.definition.implementationVersion, previous.definition.implementationVersion);

    if (expectedAddonKey !== undefined && !isNewer) {
      return null;
    }
    if (
      !manifest.update
      || !manifest.routes?.length
      || manifest.update.fromVersion !== previous.definition.implementationVersion
      || !isNewer
      || manifest.definition.configurationSchemaVersion !== previous.definition.configurationSchemaVersion
      || previous.collections.some(collection => !manifest.collections.some(next => next.name === collection.name))
    ) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Invalid add-on update declaration');
    }

    const previousActions = previous.authorization?.actions ?? [];

    if (previous.authorization && !manifest.authorization) {
      throw new BusinessError(BusinessErrorCode.Validation, 'An update must retain its Action declaration');
    }
    if (
      manifest.update.mode === AddonUpdateMode.Compatible
      && (Boolean(previous.authorization) !== Boolean(manifest.authorization)
        || previousActions.some((action) => !manifest.authorization?.actions.some(
          (candidate) => candidate.actionId === action.actionId,
        )))
    ) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Changing an Action boundary requires an Exclusive update');
    }
    if (manifest.authorization) {
      await this.packages.actionCatalog.validate(key, manifest.authorization);
    }
    await this.validateMigrations(directory, previousDirectory, previous, manifest);
    const digest = await fileHash(await checked(directory, 'addon.runtime.json'));
    const destination = await checked(this.root, key + '/' + digest);

    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    const exists = await stat(destination).then(() => true).catch((error: unknown) => {
      if (!missing(error)) {
        throw error;
      }

      return false;
    });

    if (!exists) {
      const staging = await checked(this.root, '.update-' + randomUUID());

      try {
        await cp(directory, staging, { recursive: true, errorOnExist: true, force: false });
        await AddonPackageRegistry.validateSnapshotPackage(staging, this.packages.dumpMetadata(), true);
        await moveAddonDirectory(staging, destination);
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
    } else {
      await AddonPackageRegistry.validateSnapshotPackage(destination, this.packages.dumpMetadata(), true);
    }

    const proposal: IAddonUpdateProposal = {
      updateId: randomUUID(),
      addonKey: key,
      fromDigest: selected,
      toDigest: digest,
      fromVersion: previous.definition.implementationVersion,
      toVersion: manifest.definition.implementationVersion,
      mode: await this.gate.paused(key) ? AddonUpdateMode.Exclusive : manifest.update.mode,
    };

    await mkdir(await checked(this.root, '.updates'), { recursive: true, mode: 0o700 });
    await writeFile(await checked(this.root, '.updates/' + proposal.updateId + '.json'), JSON.stringify(proposal), {
      flag: 'wx', mode: 0o600,
    });

    return proposal;
  }

  async prepareContent(content: IBinaryContent): Promise<IAddonUpdateProposal> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const staging = await mkdtemp(path.join(this.root, '.upload-'));

    try {
      const archive = path.join(staging, 'addon.runtime.gz');
      const file = await open(archive, 'wx', 0o600);
      let received = 0;

      try {
        for await (const chunk of content.bytes) {
          received += chunk.length;

          if (received > maximumAddonArchiveBytes || received > content.byteSize) {
            throw new BusinessError(BusinessErrorCode.Validation, 'Add-on archive is too large');
          }
          await file.writeFile(chunk);
        }

        if (received !== content.byteSize) {
          throw new BusinessError(BusinessErrorCode.Validation, 'Truncated add-on archive');
        }
      } finally {
        await file.close();
      }
      const directory = path.join(staging, 'package');

      await extractAddonArchive(archive, directory);

      return await this.prepare(directory);
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }

  private async validateMigrations(directory: string, previousDirectory: string, previous: IAddonPackageManifest,
    manifest: IAddonPackageManifest): Promise<void> {
    const oldFiles = Object.keys(previous.files).filter(name => name.startsWith('migrations/')).sort();
    const migrations = await readMigrations(path.join(directory, 'migrations'));
    const prior = await readMigrations(path.join(previousDirectory, 'migrations'));
    const owner = AddonPackageRegistry.migrationOwner(manifest.definition.addonKey);
    const receipts = await this.connection.db!.collection<{ _id: string; checksum: string }>(
      migrationReceiptCollection(owner),
    ).find({}).toArray();
    const major = manifest.definition.implementationVersion.split('.')[0];
    const newMajor = major !== previous.definition.implementationVersion.split('.')[0];
    const candidate = migrations[0]!.replaces;
    const accepted = new Map(migrations.map(({ id, checksum }) => [id, checksum]));

    if (receipts.some(({ _id, checksum }) => (accepted.get(_id) ?? candidate?.[_id]) !== checksum)) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Applied migration receipts are missing or changed');
    }
    if (newMajor && manifest.collections.length) {
      const history = new Map(Object.entries(prior[0]!.replaces ?? {}));
      const applied = new Map(receipts.map(({ _id, checksum }) => [_id, checksum]));

      for (const { id, checksum } of prior) {
        if (previous.files['migrations/' + id + '.json'] !== checksum || applied.get(id) !== checksum) {
          throw new BusinessError(BusinessErrorCode.Conflict, 'Installed migration receipt is missing or changed');
        }
        history.set(id, checksum);
      }

      if (
        manifest.update?.mode !== AddonUpdateMode.Exclusive
        || migrations.length !== 1
        || migrations[0]!.id !== '0000-runtime-v' + major
        || migrations[0]!.transform
        || !candidate
        || Object.keys(candidate).length !== history.size
        || [...history].some(([id, checksum]) => candidate[id] !== checksum)
      ) {
        throw new BusinessError(BusinessErrorCode.Conflict,
          'Major updates require a single Exclusive migration baseline with the full installed history');
      }

      return;
    }

    for (const name of oldFiles) {
      if (manifest.files[name] !== previous.files[name]) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Applied migration bytes must be preserved');
      }
    }
    const schemas = new Map(prior.flatMap(migration => migration.collections.map(collection =>
      [collection.name, collection])));

    for (const migration of migrations) {
      if (
        manifest.update?.mode === AddonUpdateMode.Compatible
        && !oldFiles.includes('migrations/' + migration.id + '.json')
      ) {
        for (const collection of migration.collections) {
          const previousSchema = schemas.get(collection.name);

          if (previousSchema) {
            assertCompatibleAddonSchema(previousSchema, collection);
          }
          schemas.set(collection.name, collection);
        }
      }

      const name = 'migrations/' + migration.id + '.json';

      if (migration.transform || !oldFiles.includes(name) && name <= oldFiles[oldFiles.length - 1]!) {
        throw new BusinessError(BusinessErrorCode.Validation, 'Updates require append-only owned migrations');
      }
      if (
        manifest.update?.mode === AddonUpdateMode.Compatible
        && !oldFiles.includes(name)
        && migration.collections.some(collection => collection.fieldDefaults || collection.removedIndexes?.length)
      ) {
        throw new BusinessError(BusinessErrorCode.Validation,
          'Compatible updates cannot rewrite records or remove indexes');
      }
    }
  }

  private async proposal(updateId: string): Promise<IAddonUpdateProposal> {
    if (!/^[a-f0-9-]{36}$/.test(updateId)) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Invalid update identity');
    }

    const filename = await checked(this.root, '.updates/' + updateId + '.json');
    const value = packageObject(JSON.parse(await readFile(filename, 'utf8')));
    const mode = Object.values(AddonUpdateMode).find(mode => mode === value.mode);

    if (
      value.updateId !== updateId
      || typeof value.addonKey !== 'string'
      || !/^[a-z][a-z0-9-]{0,63}$/.test(value.addonKey)
      || typeof value.fromDigest !== 'string'
      || !/^[a-f0-9]{64}$/.test(value.fromDigest)
      || typeof value.toDigest !== 'string'
      || !/^[a-f0-9]{64}$/.test(value.toDigest)
      || typeof value.fromVersion !== 'string'
      || typeof value.toVersion !== 'string'
      || !mode
    ) {
      throw new Error('Invalid private update proposal');
    }

    return {
      updateId,
      addonKey: value.addonKey,
      fromDigest: value.fromDigest,
      toDigest: value.toDigest,
      fromVersion: value.fromVersion,
      toVersion: value.toVersion,
      mode,
    };
  }

  async status(updateId: string): Promise<IAddonUpdateState | IAddonUpdateProposal> {
    const proposal = await this.proposal(updateId);
    const state = await this.gate.read(proposal.addonKey);

    if (state?.updateId === updateId) {
      return state;
    }

    const filename = await checked(this.root, '.updates/' + updateId + '.state.json');
    const saved: unknown = await readFile(filename, 'utf8').then(value => JSON.parse(value)).catch((error: unknown) => {
      if (!missing(error)) {
        throw error;
      }

      return null;
    });

    if (saved === null) {
      return proposal;
    }

    const data = packageObject(saved);
    const phase = Object.values(AddonUpdatePhase).find(phase => phase === data.phase);

    if (
      !phase
      || typeof data.paused !== 'boolean'
      || typeof data.forcedProcessCount !== 'number'
      || !Number.isSafeInteger(data.forcedProcessCount)
      || data.forcedProcessCount < 0
      || typeof data.updatedAt !== 'string'
      || !Number.isFinite(Date.parse(data.updatedAt))
      || data.updateId !== proposal.updateId
      || data.toDigest !== proposal.toDigest
    ) {
      throw new Error('Invalid retained update state');
    }

    return {
      ...proposal,
      phase,
      paused: data.paused,
      forcedProcessCount: data.forcedProcessCount,
      updatedAt: new Date(data.updatedAt),
    };
  }

  async begin(updateId: string, actorId: string): Promise<IAddonUpdateState> {
    const proposal = await this.proposal(updateId);
    const status = await this.status(updateId);

    if ('phase' in status && status.phase === AddonUpdatePhase.Completed) {
      return status;
    }

    const previous = await this.gate.read(proposal.addonKey);

    if (previous && [AddonUpdatePhase.Completed, AddonUpdatePhase.Failed].includes(previous.phase)) {
      await this.retainState(previous);
    }

    const selected = await this.selected(proposal.addonKey);

    if (![proposal.fromDigest, proposal.toDigest].includes(selected)) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Selected add-on changed; prepare a new update');
    }

    return this.gate.begin(proposal, actorId);
  }

  async pause(proposal: IAddonUpdateProposal): Promise<void> {
    await this.gate.change(proposal, AddonUpdatePhase.Quiescing, true);
  }

  async migrate(proposal: IAddonUpdateProposal): Promise<void> {
    await this.gate.change(proposal, AddonUpdatePhase.Migrating);

    if (proposal.mode === AddonUpdateMode.Exclusive) {
      await this.gate.invalidatePermits(proposal);
    }

    const root = proposal.addonKey + '/';
    const directory = await checked(this.root, root + proposal.toDigest);
    const previous = await checked(this.root, root + proposal.fromDigest);
    const metadata = this.packages.dumpMetadata();
    const [manifest, installed] = await Promise.all([
      AddonPackageRegistry.validateSnapshotPackage(directory, metadata, true),
      AddonPackageRegistry.validateSnapshotPackage(previous, metadata, true),
    ]);

    await this.validateMigrations(directory, previous, installed, manifest);
    await applyMigrations(this.connection, path.join(directory, 'migrations'),
      AddonPackageRegistry.migrationOwner(proposal.addonKey));
  }

  async activate(proposal: IAddonUpdateProposal): Promise<void> {
    const temporary = await checked(this.root, proposal.addonKey + '.json.tmp');

    await writeFile(temporary, JSON.stringify({ key: proposal.addonKey, digest: proposal.toDigest }), { mode: 0o600 });
    await rename(temporary, await checked(this.root, proposal.addonKey + '.json'));
    await this.gate.change(proposal, AddonUpdatePhase.Activating);
  }

  async restart(proposal: IAddonUpdateProposal): Promise<number> {
    return (await this.restartProcesses(proposal.addonKey)).length;
  }

  async complete(proposal: IAddonUpdateProposal, forcedProcessCount: number): Promise<IAddonUpdateState> {
    const manifest = readAddonPackageManifest(JSON.parse(await readFile(
      await checked(this.root, proposal.addonKey + '/' + proposal.toDigest + '/addon.runtime.json'), 'utf8')));
    const declaration = manifest.authorization;
    const state = await this.gate.change(proposal, AddonUpdatePhase.Completed, false, forcedProcessCount,
      declaration ? (session) => this.packages.actionCatalog.activate(
        proposal.addonKey, proposal.toDigest, declaration, session,
      ) : undefined);

    await this.retainState(state);

    return state;
  }

  async fail(proposal: IAddonUpdateProposal): Promise<void> {
    const state = await this.gate.change(proposal, AddonUpdatePhase.Failed, true);

    await this.retainState(state);
  }

  private async retainState(state: IAddonUpdateState): Promise<void> {
    const filename = await checked(this.root, '.updates/' + state.updateId + '.state.json');

    await writeFile(filename + '.tmp', JSON.stringify(state), { mode: 0o600 });
    await rename(filename + '.tmp', filename);
  }

  private async selected(key: string): Promise<string> {
    const selected = packageObject(JSON.parse(await readFile(await checked(this.root, key + '.json'), 'utf8')));

    if (selected.key !== key || typeof selected.digest !== 'string' || !/^[a-f0-9]{64}$/.test(selected.digest)) {
      throw new Error('Invalid selected add-on identity');
    }

    return selected.digest;
  }
}
