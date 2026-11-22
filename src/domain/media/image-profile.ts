export enum ImageProfileId {
  Base320 = 'w320',
  Small576 = 'w576',
  Medium768 = 'w768',
  Large992 = 'w992',
  Wide1200 = 'w1200',
  Maximum1440 = 'w1440',
}

export interface IImageProfile {
  readonly profileId: ImageProfileId;
  readonly targetWidth: number;
}

export const RESPONSIVE_IMAGE_PROFILE_VERSION = '2';

export function responsiveWidth(originalWidth: number, viewportWidth: number): number {
  return Math.max(1, Math.round(Math.min(originalWidth, 1440) * viewportWidth / 1440));
}

export const RESPONSIVE_IMAGE_PROFILES: readonly IImageProfile[] = Object.freeze([
  Object.freeze({ profileId: ImageProfileId.Base320, targetWidth: 320 }),
  Object.freeze({ profileId: ImageProfileId.Small576, targetWidth: 576 }),
  Object.freeze({ profileId: ImageProfileId.Medium768, targetWidth: 768 }),
  Object.freeze({ profileId: ImageProfileId.Large992, targetWidth: 992 }),
  Object.freeze({ profileId: ImageProfileId.Wide1200, targetWidth: 1200 }),
  Object.freeze({ profileId: ImageProfileId.Maximum1440, targetWidth: 1440 }),
]);
