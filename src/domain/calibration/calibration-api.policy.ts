import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';

export function calibrationApiPath(path: string): string {
  let decoded: string;

  try {
    decoded = decodeURIComponent(path);
  } catch {
    throw new BusinessError(BusinessErrorCode.Validation, 'Invalid calibration API encoding');
  }
  const url = new URL(path, 'http://calibration.invalid');
  const decodedUrl = new URL(decoded, 'http://calibration.invalid');

  if (
    path.length > 4096
    || !path.startsWith('/api/')
    || !url.pathname.startsWith('/api/')
    || url.origin !== 'http://calibration.invalid'
    || url.hash
    || /[\r\n\\]/.test(decoded)
    || /(?:^|\/)\.\.(?:\/|$)/.test(decoded)
    || /^\/api\/(?:admin|health)(?:\/|$)/i.test(decodedUrl.pathname)
  ) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Expected a public calibration API path');
  }

  return url.pathname + url.search;
}
