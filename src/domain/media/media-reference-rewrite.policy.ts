import type { ITemplateObject, TemplateValue } from '../pages/page-rendering.js';
import type { IParameterContract } from '../publication/render-plan.js';
import type { ISiteState } from '../sites/site.js';

export interface IMediaPathReplacement { readonly from: string; readonly to: string; }

export interface IMediaReferenceRewriter {
  text(value: string): string;
  value(value: TemplateValue): TemplateValue;
  object(value: ITemplateObject): ITemplateObject;
  parameters(fields: readonly IParameterContract[]): readonly IParameterContract[];
}

export function mediaReferenceOrigins(site: ISiteState): string[] {
  return ['', 'https://' + site.primaryDomain, 'http://' + site.primaryDomain,
    site.addresses?.publicOrigin, site.addresses?.localOrigin].filter((item): item is string =>
    item !== undefined && item !== null);
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface IAbsoluteUrlRange {
  readonly start: number;
  readonly end: number;
}

function srcsetAttribute(value: string, quote: number): boolean {
  let end = quote - 1;

  while (end >= 0 && /\s/u.test(value[end]!)) {
    end--;
  }

  if (value[end] !== '=') {
    return false;
  }
  end--;

  while (end >= 0 && /\s/u.test(value[end]!)) {
    end--;
  }
  const start = end - 'srcset'.length + 1;

  return value.slice(Math.max(0, start), end + 1).toLowerCase() === 'srcset'
    && (start === 0 || !/[\p{L}\p{N}\p{M}_:-]/u.test(value[start - 1]!));
}

function absoluteUrlRanges(value: string): IAbsoluteUrlRange[] {
  const result: IAbsoluteUrlRange[] = [];
  const starts = /\/\//gu;

  for (let match = starts.exec(value); match; match = starts.exec(value)) {
    let start = match.index;

    if (value[start - 1] === ':') {
      let scheme = start - 2;

      while (scheme >= 0 && /[A-Za-z0-9+.-]/u.test(value[scheme]!)) {
        scheme--;
      }

      if (/[A-Za-z]/u.test(value[scheme + 1]!)) {
        start = scheme + 1;
      }
    }

    let prefix = start - 1;

    while (prefix >= 0 && /\s/u.test(value[prefix]!)) {
      prefix--;
    }
    const quote = value[prefix];
    const quoted = quote !== undefined && /["'\x60]/u.test(quote);
    const srcset = quoted && srcsetAttribute(value, prefix);
    const cssPrefix = value.slice(Math.max(0, prefix - 4), prefix + 1);
    const css = !quoted && /(?:^|[^\p{L}\p{N}\p{M}_-])url\($/iu.test(cssPrefix);
    let escaped = false;
    let end = start;

    for (; end < value.length; end++) {
      const character = value[end]!;

      if (
        quoted ? character === quote && !escaped || srcset && /\s/u.test(character)
          : /[\s"'<>\x60]/u.test(character) || css && character === ')'
      ) {
        break;
      }
      escaped = character === '\\' && !escaped;
    }
    result.push({ start, end });
    starts.lastIndex = end;
  }

  return result;
}

function encodedPath(value: string): string {
  return value.replace(/[()]/gu, (character) => '%' + character.charCodeAt(0).toString(16).toUpperCase());
}

export function mediaReferenceRewriter(paths: readonly IMediaPathReplacement[],
  origins: readonly string[]): IMediaReferenceRewriter {
  if (!paths.length) {
    return { text: (value) => value, value: (value) => value, object: (value) => value, parameters: (value) => value };
  }

  const replacements = new Map<string, string>();

  for (const { from, to } of paths) {
    for (const origin of origins) {
      for (const path of new Set([from, decodeURIComponent(from), encodedPath(from)])) {
        replacements.set(origin + path, origin + encodedPath(to));
      }
    }
  }
  const pattern = new RegExp(String.raw`(?<![\p{L}\p{N}\p{M}_%./:\\-])(?:`
    + [...replacements.keys()].sort((a, b) => b.length - a.length).map(escapePattern).join('|')
    + ')(?=[?#\\s"\'<>),;\x60]|$)', 'gu');
  const text = (value: string): string => {
    const urls = absoluteUrlRanges(value);
    let index = 0;

    return value.replace(pattern, (match: string, offset: number) => {
      while (urls[index] && urls[index]!.end <= offset) {
        index++;
      }

      const url = urls[index];

      if (url && url.start < offset && offset < url.end) {
        return match;
      }

      const end = offset + match.length;

      if (value[end] === ')' && value[offset - 1] !== '(') {
        return match;
      }
      if (value[end] === ' ' && (offset === 0 || /["'\x60]/u.test(value[offset - 1]!))) {
        const quote = value[offset - 1];
        const closing = quote ? value.indexOf(quote, end) : value.length;
        const tail = value.slice(end, closing < 0 ? value.length : closing).split(/[?#]/u)[0]!;

        if (/^[\p{L}\p{N} ()._-]+\.[A-Za-z0-9]+$/u.test(tail)) {
          return match;
        }
      }

      return replacements.get(match)!;
    });
  };
  const rewriteObject = (value: ITemplateObject): ITemplateObject =>
    Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item)]));
  const rewrite = (value: TemplateValue): TemplateValue => {
    if (typeof value === 'string') {
      return text(value);
    }
    if (Array.isArray(value)) {
      return value.map((item: TemplateValue) => rewrite(item));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries<TemplateValue>(value).map(([key, item]) => [key, rewrite(item)]));
    }

    return value;
  };
  const parameters = (fields: readonly IParameterContract[]): readonly IParameterContract[] =>
    fields.map((field) => ({
      ...field,
      ...(field.defaultValue === undefined ? {} : { defaultValue: rewrite(field.defaultValue) }),
      ...(field.properties ? { properties: parameters(field.properties) } : {}),
      ...(field.items ? { items: parameters([field.items])[0]! } : {}),
    }));

  return { text, value: rewrite, object: rewriteObject, parameters };
}

