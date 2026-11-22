import { minify } from 'html-minifier-terser';

import type { ITemplateObject, TemplateValue } from '../../../../domain/pages/page-rendering.js';
import type { ICompiledPageAssets, IHtmlOutput } from '../../../../domain/publication/published-document.js';
import type { IPreparedInlineStyle } from '../../../../domain/publication/published-document.js';
import { type IParameterContract, ParameterKind } from '../../../../domain/publication/render-plan.js';
import { requireCondition } from '../../../../domain/shared/validation.js';
import type { IDocumentOutputPort } from '../../../../ports/outbound/publication/document-output.port.js';
import { inlineStyleHashes } from './inline-style-hashes.js';

export { inlineStyleHashes } from './inline-style-hashes.js';

import { RenderStage } from '../../../../domain/diagnostics/page-resolution.js';
import type { IRenderObservationPort } from '../../../../ports/outbound/diagnostics/render-observation.port.js';
import { validateParameters } from '../modx/parameters.js';

export class DocumentOutputAdapter implements IDocumentOutputPort {
  constructor(private readonly observation?: IRenderObservationPort) {}

  normalizeRequest(schema: readonly IParameterContract[], input: ITemplateObject): ITemplateObject {
    const declared = new Set(schema.map((field) => field.name));
    const values: Record<string, TemplateValue> = Object.fromEntries(Object.entries(input).filter(([name]) =>
      declared.has(name)));

    for (const field of schema) {
      const value = values[field.name];

      if (typeof value !== 'string') {
        continue;
      }
      if (field.kind === ParameterKind.Boolean && ['true', 'false'].includes(value)) {
        values[field.name] = value === 'true';
      } else if (field.kind === ParameterKind.Number && /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) {
        values[field.name] = Number(value);
      } else if ([ParameterKind.Array, ParameterKind.Object].includes(field.kind)) {
        try {
          values[field.name] = JSON.parse(value);
        } catch {
          requireCondition(false, `Invalid structured request value: ${field.name}`);
        }
      }
    }

    return validateParameters(schema, values);
  }

  inlineStyleHashes(html: string, prepared?: readonly IPreparedInlineStyle[]): readonly string[] {
    return this.observation ? this.observation.sync(RenderStage.StyleHashes,
      () =>
        inlineStyleHashes(html, prepared)) : inlineStyleHashes(html, prepared);
  }

  async complete(html: string, assets: ICompiledPageAssets): Promise<IHtmlOutput> {
    requireCondition(html.includes('</head>') && html.includes('</body>'), 'Missing document injection points');
    const result = await minify(html.replace('</head>', assets.head + '</head>')
      .replace('</body>', assets.body + '</body>'), {
      collapseWhitespace: true,
      removeComments: true,
      removeAttributeQuotes: false,
      keepClosingSlash: true,
    });

    return { html: result, inlineStyleHashes: this.inlineStyleHashes(result, assets.inlineStyles) };
  }
}
