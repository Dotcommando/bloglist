import {
  TemplateValidationError, TemplateValidationIssue,
} from '../../../../domain/publication/template-validation.error.js';
import { requireCondition } from '../../../../domain/shared/validation.js';

export interface ITextNode { readonly text: string; }

export interface ITagNode {
  readonly tag: string;
  readonly request: boolean;
  readonly name: string;
  readonly parameters: Readonly<Record<string, string>>;
}

export type TemplateNode = ITextNode | ITagNode;

export function tokenize(html: string): readonly TemplateNode[] {
  const result: TemplateNode[] = [];
  let start = 0;

  while (start < html.length) {
    const open = html.indexOf('[[', start);

    if (open < 0) {
      result.push({ text: html.slice(start) });
      break;
    }
    if (open > start) {
      result.push({ text: html.slice(start, open) });
    }

    let cursor = open + 2;
    let depth = 1;

    while (cursor < html.length && depth) {
      if (html.slice(cursor, cursor + 2) === '[[') {
        depth++;
        cursor += 2;
      } else if (html.slice(cursor, cursor + 2) === ']]') {
        depth--;
        cursor += 2;
      } else {
        cursor++;
      }
    }
    requireCondition(depth === 0, `Unclosed Zarya tag at offset ${open}`);
    const tag = html.slice(open + 2, cursor - 2).trim();
    const header = /^!?~/.test(tag) ? /^(!?)(~)([1-9][0-9]{0,18})$/.exec(tag) : /^!?\$/.test(tag)
      ? /^(!?)(\$)([\p{L}\p{M}\p{N}_.-]{1,200})(?=\?|\s+&|$)/u.exec(tag)
      : /^!?[+*]/.test(tag) ? /^(!?)(\+\+|[+*])([A-Za-z][A-Za-z0-9_.]*)(:markdown)?/.exec(tag)
        : /^(!?)()([\p{L}\p{M}\p{N}_.-]{1,200})(?=\?|\s+&|$)/u.exec(tag);

    requireCondition(header !== null, `Invalid Zarya tag at offset ${open}`);

    if (!header) {
      throw new Error('Invalid tag');
    }
    requireCondition(!/^[0-9]/.test(header[3]!) || ['', '$', '~'].includes(header[2]!) && header[4] === undefined,
      'Numeric keys identify elements only');

    const name = `${header[2]}${header[3]}${header[4] ?? ''}`;
    let position = header[0].length;
    const parameters: Record<string, string> = {};

    if (tag.slice(position).trim()) {
      if (tag[position] !== '?') {
        throw new TemplateValidationError({ issue: TemplateValidationIssue.MissingParameterSeparator });
      }
      position++;

      while (position < tag.length) {
        while (/\s/.test(tag[position] ?? '') && position < tag.length) {
          position++;
        }

        if (position === tag.length) {
          break;
        }

        const parameter = /^&([A-Za-z][A-Za-z0-9_]*)\s*=\s*`/.exec(tag.slice(position));

        requireCondition(parameter !== null, `Invalid parameter in ${tag}`);

        if (!parameter) {
          throw new Error('Invalid parameter');
        }

        const key = parameter[1]!;

        requireCondition(!Object.hasOwn(parameters, key) && !['constructor', 'prototype'].includes(key),
          `Duplicate or unsafe parameter: ${key}`);
        position += parameter[0].length;
        let value = '';
        let nested = 0;
        let closed = false;

        while (position < tag.length) {
          const char = tag[position]!;

          if (char === '\\') {
            requireCondition(['`', '\\'].includes(tag[position + 1] ?? ''), 'Unsupported escape');
            value += tag[position + 1];
            position += 2;
          } else if (tag.slice(position, position + 2) === '[[') {
            nested++;
            value += '[[';
            position += 2;
          } else if (nested && tag.slice(position, position + 2) === ']]') {
            nested--;
            value += ']]';
            position += 2;
          } else if (char === '`' && !nested) {
            position++;
            closed = true;
            break;
          } else {
            value += char;
            position++;
          }
        }
        requireCondition(closed, `Unclosed parameter: ${key}`);
        parameters[key] = value;
      }
    }
    result.push({ tag, name, request: header[1] === '!', parameters });
    start = cursor;
  }

  return result;
}
