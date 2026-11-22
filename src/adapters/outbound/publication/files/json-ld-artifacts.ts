import { checksum } from '../../rendering/vite/artifacts.js';

export function jsonLdPagePath(pageId: string): string {
  return `json-ld/${checksum(new TextEncoder().encode(pageId))}.json`;
}
