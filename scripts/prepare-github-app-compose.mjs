import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

export const githubAppComposeFile = 'compose.github-app.yml';

const appGroupId = 1000;

async function setPrivateMode(target, directory) {
  const flags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    | (directory ? constants.O_DIRECTORY : 0);
  const handle = await open(target, flags);

  try {
    const info = await handle.stat();

    if (directory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1) {
      throw new Error('The GitHub App mount requires a private directory and regular, unlinked PEM files');
    }
    await handle.chown(0, appGroupId);
    await handle.chmod(directory ? 0o2750 : 0o640);
  } finally {
    await handle.close();
  }
}

export async function prepareGitHubAppCompose(root, environment, production) {
  const clientId = environment.ZARYA_GITHUB_APP_CLIENT_ID;

  if (!clientId) {
    return false;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(clientId)) {
    throw new Error('Set a valid ZARYA_GITHUB_APP_CLIENT_ID before preparing Compose');
  }

  const relative = '.secrets/github-app';
  const standard = path.join(root, relative);
  const directory = path.resolve(root, environment.ZARYA_GITHUB_APP_HOST_KEYS_DIR || relative);
  const info = await lstat(directory).catch(error => {
    if (error?.code === 'ENOENT') {
      throw new Error('GitHub App key directory is missing. Place the PEM files there before preparing Compose.');
    }
    throw error;
  });

  if (!info.isDirectory()) {
    throw new Error('GitHub App key directory must be a real directory');
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const keys = entries.filter(entry => entry.isFile() && /\.pem$/i.test(entry.name));

  if (!keys.length) {
    throw new Error('GitHub App key directory contains no PEM files');
  }
  if (production && process.platform === 'linux' && process.getuid?.() === 0 && directory === standard) {
    if (await realpath(directory) !== path.join(await realpath(root), relative)) {
      throw new Error('The standard GitHub App key directory must remain inside this installation');
    }
    await setPrivateMode(directory, true);

    for (const entry of keys) {
      await setPrivateMode(path.join(directory, entry.name), false);
    }
  }

  return true;
}
