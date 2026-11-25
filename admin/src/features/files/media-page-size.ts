export const mediaPageSizes = [25, 50, 100] as const;

export type MediaPageSize = typeof mediaPageSizes[number];

export const defaultMediaPageSize: MediaPageSize = 25;

const sessionSizes = new Map<string, MediaPageSize>();

export function isMediaPageSize(value: unknown): value is MediaPageSize {
  return mediaPageSizes.some((size) => size === value);
}

export function readMediaPageSize(siteId: string): MediaPageSize {
  try {
    const saved = Number(localStorage.getItem('zarya.files.page-size.' + siteId));

    if (isMediaPageSize(saved)) {
      return saved;
    }
  } catch {
    // Browser storage can be unavailable in restricted profiles.
  }

  return sessionSizes.get(siteId) ?? defaultMediaPageSize;
}

export function setMediaPageSize(siteId: string, size: MediaPageSize): void {
  try {
    localStorage.setItem('zarya.files.page-size.' + siteId, String(size));
  } catch {
    // Keep the selection for this session when storage is unavailable.
  }
  sessionSizes.set(siteId, size);
}
