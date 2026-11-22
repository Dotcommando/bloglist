export interface IHookGenerationPort {
  currentGeneration(siteId: string): Promise<string | null>;
}
