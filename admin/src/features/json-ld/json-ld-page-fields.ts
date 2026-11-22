import type { ICmsCoreApi } from '@zarya/addon-contracts/cms';

type Page = NonNullable<Awaited<ReturnType<ICmsCoreApi['pages']['getDraft']>>>;

export enum JsonLdPageField {
  Title = 'title',
  Heading = 'h1',
  MetaTitle = 'metaTitle',
  MetaDescription = 'metaDescription',
  Language = 'language',
  CreatedAt = 'createdAt',
  UpdatedAt = 'updatedAt',
}

export const JSON_LD_PAGE_FIELDS = Object.values(JsonLdPageField) satisfies readonly (keyof Page)[];
