import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

const reusableEnvironment = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TMP', 'TEMP',
  'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'HOME', 'LANG', 'LC_ALL']);

function jsonOutput(stream, driver) {
  const events = stream.trim().split(/\r?\n/).filter(line => line.startsWith('{')).map(line => JSON.parse(line));
  const result = driver === 'hermes'
    ? events.findLast(event => event.type === 'result' && event.exit_code === 0)?.text
    : events.some(event => event.type === 'turn.completed')
      ? events.findLast(event => event.type === 'item.completed' && event.item?.type === 'agent_message')?.item.text
      : undefined;

  if (typeof result !== 'string') {
    throw new Error('Agent did not return a completed response');
  }

  return JSON.parse(result.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1'));
}

export async function callModel(settings, instruction, workspace, signal) {
  const { driver, executable, entry, timeoutSeconds = 120 } = settings;

  if (
    !['hermes', 'codex'].includes(driver)
    || typeof executable !== 'string'
    || !path.isAbsolute(executable)
    || !Number.isInteger(timeoutSeconds)
    || timeoutSeconds < 15
    || timeoutSeconds > 600
    || entry !== undefined
    && (typeof entry !== 'string'
    || !path.isAbsolute(entry))
  ) {
    throw new Error('Invalid local model client configuration');
  }

  const cwd = await mkdtemp(path.join(workspace, 'agent-'));
  const prompt = path.join(cwd, 'prompt.txt');
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => reusableEnvironment.has(name.toUpperCase())));
  const args = entry ? [entry] : [];

  try {
    let command;

    if (driver === 'hermes') {
      await writeFile(prompt, instruction, { encoding: 'utf8', mode: 0o600 });
      command = ['chat', '--oneshot', '--format', 'stream-json', '--ignore-rules', '--toolsets', 'web',
        '--source', 'tool', '--max-turns', '6', '--query-file', prompt];
    } else {
      command = ['exec', '--json', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '-'];
    }

    const running = execute(executable, [...args, ...command], {
      cwd, env, signal, timeout: timeoutSeconds * 1000, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
    });

    if (driver === 'codex') {
      running.child.stdin.on('error', () => { /* execFile reports the failed child. */ });
      running.child.stdin.end(instruction);
    }

    const output = await running.catch(() => {
      throw new Error(driver + ' failed or exceeded its run budget');
    });

    try {
      return jsonOutput(output.stdout, driver);
    } catch {
      throw new Error(driver + ' did not emit the expected JSON response');
    }
  } finally {
    // This directory is created by mkdtemp under the validated private workspace for this invocation.
    const target = path.resolve(cwd);

    if (path.dirname(target) === path.resolve(workspace)) {
      await rm(target, { recursive: true, force: true });
    }
  }
}
