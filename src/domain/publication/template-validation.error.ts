import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';
import type { TemplateSourceKind } from './render-plan.js';

export enum TemplateValidationIssue {
  MissingParameterSeparator = 'MissingParameterSeparator',
  UnknownChunkParameter = 'UnknownChunkParameter',
  MissingChunkParameter = 'MissingChunkParameter',
}

export interface ITemplateDiagnostic {
  readonly issue: TemplateValidationIssue;
  readonly source?: { readonly kind: TemplateSourceKind; readonly key: string };
  readonly parameter?: string;
}

export class TemplateValidationError extends BusinessError {
  constructor(readonly diagnostic: ITemplateDiagnostic) {
    super(BusinessErrorCode.Validation, 'Template validation failed');
    this.name = 'TemplateValidationError';
  }
}
