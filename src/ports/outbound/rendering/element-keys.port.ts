import type { TemplateSourceKind } from '../../../domain/publication/render-plan.js';

export interface IElementKeys {
  reserve(input: { readonly siteId: string; readonly kind: TemplateSourceKind; readonly after: bigint }):
  Promise<string>;
}
