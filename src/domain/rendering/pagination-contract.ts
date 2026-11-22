import { type IParameterContract, ParameterKind } from '../publication/render-plan.js';

export const paginationItemContract: IParameterContract = {
  name: 'item',
  kind: ParameterKind.Object,
  required: true,
  properties: ['pageId', 'title', 'path'].map((name) => ({ name, kind: ParameterKind.String, required: true })),
};

export const paginationLinkContract: IParameterContract = {
  name: 'item',
  kind: ParameterKind.Object,
  required: true,
  properties: [
    { name: 'page', kind: ParameterKind.Number, required: true },
    { name: 'href', kind: ParameterKind.String, required: true },
    { name: 'current', kind: ParameterKind.Boolean, required: true },
    { name: 'ariaCurrent', kind: ParameterKind.String, required: true },
  ],
};
