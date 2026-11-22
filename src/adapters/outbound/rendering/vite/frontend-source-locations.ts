/** Technical source locations for Vite and authored asset resolution. */
export interface IFrontendSourceLocations {
  directory(siteKey: string, sourceId: string): string | undefined;
}
