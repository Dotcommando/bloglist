import { describe, expect, it } from 'vitest';

import { UpdateAddonUseCase } from '../../src/app/use-cases/addons/update-addon.use-case.js';
import { AddonUpdateMode, AddonUpdatePhase, type IAddonUpdateState } from '../../src/domain/addons/addon-update.js';
import type { IAddonUpdatesPort } from '../../src/ports/outbound/addons/addon-updates.port.js';

function fixture(mode: AddonUpdateMode, failure?: string): { calls: string[]; useCase: UpdateAddonUseCase } {
  const calls: string[] = [];
  const state: IAddonUpdateState = {
    updateId: 'update',
    addonKey: 'synthetic',
    fromDigest: 'old',
    toDigest: 'new',
    fromVersion: '0.1.0',
    toVersion: '0.2.0',
    mode,
    phase: AddonUpdatePhase.Prepared,
    paused: false,
    forcedProcessCount: 0,
    updatedAt: new Date('2026-11-16T00:00:00Z'),
  };
  const step = async (name: string): Promise<void> => {
    calls.push(name);

    if (failure === name) {
      throw new Error(name);
    }
  };
  const updates: IAddonUpdatesPort = {
    begin: async () => {
      await step('begin');

      return state;
    },
    reserve: async () => {
      await step('reserve');

      return () => step('release');
    },
    pause: () => step('pause'),
    migrate: () => step('migrate'),
    activate: () => step('activate'),
    restart: async () => {
      await step('restart');

      return 1;
    },
    complete: async (_proposal, forcedProcessCount) => {
      await step('complete');

      return { ...state, phase: AddonUpdatePhase.Completed, forcedProcessCount };
    },
    fail: () => step('fail'),
  };
  const access = { requireAdministrator: () => step('authorize') };

  return { calls, useCase: new UpdateAddonUseCase(access, updates) };
}

describe('UpdateAddon', () => {
  it('drains a paused generation before an exclusive migration, then starts the selected generation', async () => {
    const f = fixture(AddonUpdateMode.Exclusive);
    const result = await f.useCase.execute({ actorId: 'admin', updateId: 'update' });

    expect(f.calls).toEqual([
      'authorize', 'reserve', 'begin', 'pause', 'restart', 'migrate', 'activate', 'restart', 'complete', 'release',
    ]);
    expect(result.forcedProcessCount).toBe(2);
  });

  it('overlaps generations only for a declared compatible update', async () => {
    const f = fixture(AddonUpdateMode.Compatible);

    await f.useCase.execute({ actorId: 'admin', updateId: 'update' });
    expect(f.calls).toEqual(['authorize', 'reserve', 'begin', 'migrate', 'activate', 'restart', 'complete', 'release']);
  });

  it('retains failure instead of resuming an add-on after a migration failure and releases resources', async () => {
    const f = fixture(AddonUpdateMode.Exclusive, 'migrate');

    await expect(f.useCase.execute({ actorId: 'admin', updateId: 'update' })).rejects.toThrow('migrate');
    expect(f.calls).toEqual(['authorize', 'reserve', 'begin', 'pause', 'restart', 'migrate', 'fail', 'release']);
  });

  it('does not reserve resources or touch packages for an unauthorized actor', async () => {
    const f = fixture(AddonUpdateMode.Exclusive, 'authorize');

    await expect(f.useCase.execute({ actorId: 'admin', updateId: 'update' })).rejects.toThrow('authorize');
    expect(f.calls).toEqual(['authorize']);
  });
});
