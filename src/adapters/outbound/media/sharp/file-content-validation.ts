import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

import sax from 'sax';
import verifier from 'stream-json/utils/verifier.js';

import type { IImageDimensions } from '../../../../domain/media/asset.js';
import { MediaValidationError, MediaValidationIssue } from '../../../../domain/media/media-validation.error.js';
import { FILE_CHUNK_BYTES } from '../../storage/files/binary-file.js';

async function* utf8(filename: string): AsyncGenerator<string> {
  const decoder = new TextDecoder('utf-8', { fatal: true });

  for await (const chunk of createReadStream(filename, { highWaterMark: FILE_CHUNK_BYTES })) {
    if (!(chunk instanceof Uint8Array)) {
      throw new Error('Invalid file bytes');
    }
    yield decoder.decode(chunk, { stream: true });
  }
  yield decoder.decode();
}

export async function validateCsvFile(filename: string): Promise<void> {
  let started = false;

  try {
    for await (const text of utf8(filename)) {
      if (!started) {
        const first = text.trimStart()[0];

        if (first === '<') {
          throw new MediaValidationError(MediaValidationIssue.CsvContent);
        }
        started = first !== undefined;
      }

      for (const character of text) {
        if (character.charCodeAt(0) < 32 && !['\t', '\r', '\n'].includes(character)) {
          throw new MediaValidationError(MediaValidationIssue.CsvContent);
        }
      }
    }
  } catch (error) {
    if (error instanceof MediaValidationError) {
      throw error;
    }
    throw new MediaValidationError(MediaValidationIssue.CsvEncoding);
  }
}

export async function validateJsonFile(filename: string): Promise<void> {
  try {
    await pipeline(utf8(filename), verifier.asStream());
  } catch {
    throw new MediaValidationError(MediaValidationIssue.JsonContent);
  }
}

export async function validateSvgFile(filename: string): Promise<void> {
  const options = { xmlns: true, strictEntities: true };
  const parser = sax.parser(true, options);
  let root = false;
  let depth = 0;
  let attributes = 0;
  const invalid = (): never => {
    throw new RangeError('Active, malformed or excessive SVG is unsupported');
  };

  parser.onerror = invalid;
  parser.ondoctype = invalid;
  parser.onsgmldeclaration = invalid;
  parser.onprocessinginstruction = (instruction) => {
    if (instruction.name.toLowerCase() === 'xml-stylesheet') {
      invalid();
    }
  };
  parser.onopentagstart = () => {
    attributes = 0;
  };
  parser.onattribute = () => {
    if (++attributes > 256) {
      invalid();
    }
  };
  parser.onopentag = (element) => {
    if (
      !('uri' in element)
      || element.uri !== 'http://www.w3.org/2000/svg'
      || !root
      && element.local !== 'svg'
      || ++depth > 256
      || ['script', 'foreignobject', 'iframe', 'object', 'embed', 'animate', 'set', 'animatetransform',
        'animatemotion', 'a', 'style'].includes(element.local.toLowerCase())
    ) {
      invalid();
    }
    root = true;

    for (const attribute of Object.values(element.attributes)) {
      if (typeof attribute === 'string') {
        invalid();
      }
      if (attribute.uri === 'http://www.w3.org/2000/xmlns/') {
        continue;
      }
      if (
        /^on/i.test(attribute.name)
        || attribute.name === 'style'
        || attribute.local === 'href'
        && !/^#[A-Za-z_][\w.-]*$/.test(attribute.value)
        || /(?:javascript:|data:|https?:|@import|expression\s*\()/i.test(attribute.value)
        || /url\s*\(/i.test(attribute.value)
        && !/^url\(#[A-Za-z_][\w.-]*\)$/.test(attribute.value)
      ) {
        invalid();
      }
    }
  };
  parser.onclosetag = () => {
    depth--;
  };
  let tail = '';

  for await (const text of utf8(filename)) {
    if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(tail + text)) {
      invalid();
    }
    tail = (tail + text).slice(-32);
    parser.write(text);
  }
  parser.close();

  if (!root) {
    invalid();
  }
}

export async function containsFileBytes(filename: string, needle: Buffer): Promise<boolean> {
  let tail = Buffer.alloc(0);

  for await (const chunk of createReadStream(filename, { highWaterMark: FILE_CHUNK_BYTES })) {
    if (!Buffer.isBuffer(chunk)) {
      throw new Error('Invalid file bytes');
    }

    const bytes = Buffer.concat([tail, chunk]);

    if (bytes.includes(needle)) {
      return true;
    }
    tail = bytes.subarray(Math.max(0, bytes.length - needle.length + 1));
  }

  return false;
}

export async function iconDimensions(filename: string, byteSize: number): Promise<IImageDimensions> {
  const file = await open(filename, 'r');

  try {
    const header = Buffer.alloc(6);

    await file.read(header, 0, header.length, 0);
    const count = header.readUInt16LE(4);

    if (!count || 6 + count * 16 > byteSize) {
      throw new RangeError('Invalid icon directory');
    }

    let dimensions: IImageDimensions | null = null;
    const entry = Buffer.alloc(16);

    for (let index = 0; index < count; index++) {
      if ((await file.read(entry, 0, entry.length, 6 + index * 16)).bytesRead !== 16) {
        throw new RangeError('Truncated icon');
      }

      const size = entry.readUInt32LE(8);
      const start = entry.readUInt32LE(12);

      if (!size || start < 6 + count * 16 || start + size > byteSize) {
        throw new RangeError('Truncated icon');
      }

      const width = entry[0] || 256;
      const height = entry[1] || 256;

      if (!dimensions || width * height > dimensions.width * dimensions.height) {
        dimensions = { width, height, aspectRatio: width / height };
      }
    }

    return dimensions!;
  } finally {
    await file.close();
  }
}
