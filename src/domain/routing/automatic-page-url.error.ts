import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';

export enum AutomaticPageUrlIssue {
  Heading = 'AutomaticPageUrlHeading',
  Parent = 'AutomaticPageUrlParent',
}

export class AutomaticPageUrlError extends BusinessError {
  constructor(readonly issue: AutomaticPageUrlIssue) {
    super(issue === AutomaticPageUrlIssue.Heading ? BusinessErrorCode.Validation : BusinessErrorCode.Conflict, issue);
  }
}
