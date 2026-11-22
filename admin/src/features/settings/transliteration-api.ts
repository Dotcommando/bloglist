import { object, request, string } from '../../shared/api/content-api';

export interface ITransliterationRule {
  readonly symbol: string;
  replacement: string;
}

export interface ITransliterationTable {
  readonly language: string;
  readonly rules: ITransliterationRule[];
}

export interface ITransliterationSettings {
  readonly tables: ITransliterationTable[];
  readonly collapseHyphens: boolean;
}

function readSettings(value: unknown, siteId: string): ITransliterationSettings {
  const row = object(value);

  if (
    row.siteId !== siteId
    || !Array.isArray(row.transliteration)
    || typeof row.collapseTransliterationHyphens !== 'boolean'
  ) {
    throw new Error('Invalid site transliteration response');
  }

  const tables = row.transliteration.map((value: unknown) => {
    const table = object(value);

    if (!Array.isArray(table.rules)) {
      throw new Error('Invalid site transliteration table');
    }

    return {
      language: string(table.language),
      rules: table.rules.map((value: unknown) => {
        const rule = object(value);

        return { symbol: string(rule.symbol), replacement: string(rule.replacement) };
      }),
    };
  });

  return { tables, collapseHyphens: row.collapseTransliterationHyphens };
}

export async function getTransliteration(siteId: string): Promise<ITransliterationSettings> {
  return readSettings(await request('/' + encodeURIComponent(siteId) + '/settings'), siteId);
}

export async function saveTransliteration(siteId: string, table: ITransliterationTable,
  expectedRules: readonly ITransliterationRule[], collapseHyphens: boolean, expectedCollapseHyphens: boolean):
Promise<ITransliterationSettings> {
  return readSettings(await request('/' + encodeURIComponent(siteId) + '/settings', {
    transliteration: { ...table, expectedRules, collapseHyphens, expectedCollapseHyphens },
  }), siteId);
}
