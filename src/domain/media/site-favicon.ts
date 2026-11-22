export const SITE_FAVICON_PATH = '/favicon.ico';

export const SITE_FAVICON_MIME_TYPE = 'image/x-icon';

export interface ISiteFavicon {
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
  readonly version: string;
}
