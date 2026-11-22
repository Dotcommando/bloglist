import { randomBytes } from 'node:crypto';

import parseSrcset from 'parse-srcset';
import { defaultTreeAdapter, type DefaultTreeAdapterTypes, parse, serialize } from 'parse5';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';

import type { IRenderedDocument } from '../../../../domain/publication/render-plan.js';
import type { IRenderingPreviewDocument } from '../../../../domain/rendering/rendering-preview.js';
import type { IPreviewResult } from '../../../../ports/inbound/publication/preview-page.port.js';
import type { IBuiltPublication } from '../../../../ports/outbound/publication/frontend-build.port.js';
import type { IPreviewDocuments } from '../../../../ports/outbound/rendering/preview-documents.port.js';
import { checksum } from '../../rendering/vite/artifacts.js';

interface IPreviewEntry extends IRenderingPreviewDocument {
  readonly actorId: string;
  readonly expiresAt: number;
  readonly size: number;
}

export class AdminPreviewCache implements IPreviewDocuments {
  private readonly records = new Map<string, IPreviewEntry>();

  constructor(private readonly now: () => number = Date.now) {}

  private prune(): void {
    for (const [id, entry] of this.records) {
      if (entry.expiresAt <= this.now()) {
        this.records.delete(id);
      }
    }
  }

  async read(previewId: string, actorId: string): Promise<IRenderingPreviewDocument | null> {
    this.prune();
    const entry = this.records.get(previewId);

    return entry?.actorId === actorId ? {
      siteId: entry.siteId,
      pageId: entry.pageId,
      html: entry.html,
      ...(entry.mimeType ? { mimeType: entry.mimeType } : {}),
    } : null;
  }

  async present(siteId: string, actorId: string, document: IRenderedDocument,
    build: IBuiltPublication): Promise<IPreviewResult> {
    this.prune();
    const assets = new Map<string, { bytes: Buffer; mimeType: string }>();
    let html = '';
    let size = 0;

    for (const item of build.artifacts) {
      if (!item.public) {
        continue;
      }

      const parts: Uint8Array[] = [];

      for await (const part of item.content.bytes) {
        size += part.byteLength;

        if (size > 16 * 1024 * 1024) {
          throw new Error('Preview exceeds its resource budget');
        }
        parts.push(part);
      }
      const bytes = Buffer.concat(parts);

      if (bytes.byteLength !== item.byteSize || checksum(bytes) !== item.checksum) {
        throw new Error('Corrupt preview');
      }
      assets.set('/' + item.path, { bytes, mimeType: item.mimeType });

      if (item.mimeType === 'text/html') {
        html = bytes.toString('utf8');
      }
    }

    const raw = (document.mimeType ?? 'text/html') !== 'text/html';

    if (raw) {
      html = document.html;
    } else if (!html) {
      throw new Error('Preview build contains no HTML');
    }

    const dataUrl = (url: string, owner = '/'): string => {
      if (/^(?:data:|https?:|#)/.test(url)) {
        return url;
      }

      const pathname = new URL(url, 'https://preview.invalid' + owner).pathname;
      const asset = assets.get(pathname);

      return asset ? 'data:' + asset.mimeType + ';base64,' + asset.bytes.toString('base64') : url;
    };
    const css = (text: string, owner = '/'): string => {
      const root = postcss.parse(text);

      root.walkDecls((declaration) => {
        const parsed = valueParser(declaration.value);

        parsed.walk((node) => {
          if (node.type === 'function' && node.value.toLowerCase() === 'url') {
            for (const child of node.nodes) {
              if (child.type === 'word' || child.type === 'string') {
                child.value = dataUrl(child.value, owner);
              }
            }
          }
        });
        declaration.value = parsed.toString();
      });

      return root.toString().replace(/<\/style/gi, '\\3c /style');
    };
    const tree = parse(raw ? '' : html);
    const walk = (node: DefaultTreeAdapterTypes.Node): void => {
      if ('tagName' in node) {
        const src = node.attrs.find((item) => item.name === (node.tagName === 'link' ? 'href' : 'src'));
        const asset = src ? assets.get(new URL(src.value, 'https://preview.invalid/').pathname) : undefined;

        if (node.tagName === 'script' && src && asset) {
          node.attrs = node.attrs.filter((item) => !['src', 'integrity', 'crossorigin'].includes(item.name));
          node.childNodes = [];
          defaultTreeAdapter.insertText(node, asset.bytes.toString('utf8').replace(/<\/script/gi, '<\\/script'));
        } else if (
          node.tagName === 'link'
          && asset
          && node.attrs.some((item) => item.name === 'rel' && item.value === 'stylesheet')
        ) {
          node.tagName = 'style';
          node.nodeName = 'style';
          node.attrs = [];
          node.childNodes = [];
          defaultTreeAdapter.insertText(node, css(asset.bytes.toString('utf8'), src?.value));
        } else if (node.tagName === 'style') {
          for (const child of node.childNodes) {
            if ('value' in child) {
              child.value = css(child.value);
            }
          }
        }

        for (const attribute of node.attrs) {
          if (['src', 'poster'].includes(attribute.name) && node.tagName !== 'script') {
            attribute.value = dataUrl(attribute.value);
          } else if (['srcset', 'imagesrcset'].includes(attribute.name)) {
            attribute.value = parseSrcset(attribute.value).map((candidate) => [
              dataUrl(candidate.url),
              candidate.w === undefined ? '' : candidate.w + 'w',
              candidate.d === undefined ? '' : candidate.d + 'x',
              candidate.h === undefined ? '' : candidate.h + 'h',
            ].filter(Boolean).join(' ')).join(', ');
          }
        }
      }
      if ('childNodes' in node) {
        node.childNodes.forEach(walk);
      }
    };

    walk(tree);
    html = raw ? document.html : serialize(tree);
    const htmlBytes = Buffer.byteLength(html);
    let retained = 0;

    for (const [id, entry] of this.records) {
      if (entry.siteId === siteId && entry.pageId === document.pageId && entry.actorId === actorId) {
        this.records.delete(id);
      } else {
        retained += entry.size;
      }
    }

    if (htmlBytes > 16 * 1024 * 1024 || retained + htmlBytes > 64 * 1024 * 1024) {
      throw new Error('Preview cache is full');
    }

    const previewId = randomBytes(24).toString('hex');

    this.records.set(previewId, {
      siteId,
      actorId,
      pageId: document.pageId,
      html,
      ...(document.mimeType ? { mimeType: document.mimeType } : {}),
      expiresAt: this.now() + 600000,
      size: htmlBytes,
    });

    return { ...document, html, previewId, url: '/api/admin/rendering-previews/' + previewId };
  }
}
