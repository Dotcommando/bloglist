import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import { TemplateSourceKind } from '../../../../domain/publication/render-plan.js';
import type { IRenderingElementState } from '../../../../domain/rendering/rendering-element.js';
import { readElement } from './element-codec.js';

export function elementBackupStem(element: Pick<IRenderingElementState, 'kind' | 'key' | 'name'>): string {
  if (element.kind === TemplateSourceKind.Template) {
    return element.key;
  }

  const encode = (value: string): string => '%' + value.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
  let name = element.name.normalize('NFC').replace(/[%<>:"/\\|?*]/g, encode)
    .replace(/[. ]+$/g, (value) => [...value].map(encode).join(''));

  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    name = encode(name[0]!) + name.slice(1);
  }

  let stem = '';

  for (const character of name) {
    if (Buffer.byteLength(stem + character, 'utf8') > 200) {
      break;
    }
    stem += character;
  }

  let portable = stem.replace(/[. ]+$/g, (value) => [...value].map(encode).join(''));

  while (Buffer.byteLength(portable, 'utf8') > 200) {
    stem = [...stem].slice(0, -1).join('');
    portable = stem.replace(/[. ]+$/g, (value) => [...value].map(encode).join(''));
  }

  return portable;
}

export async function elementBackupFilenames(directory: string): Promise<readonly string[]> {
  try {
    return (await readdir(directory)).filter((filename) => filename.toLowerCase().endsWith('.json')).sort();
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function readElementBackup(filename: string, siteDirectory: string): Promise<IRenderingElementState> {
  const base = await realpath(siteDirectory);
  const resolved = await realpath(filename);

  if ((await lstat(filename)).isSymbolicLink() || !resolved.startsWith(base + path.sep)) {
    throw new Error('Source escapes the configured site root');
  }

  return readElement(JSON.parse(await readFile(resolved, 'utf8')));
}
