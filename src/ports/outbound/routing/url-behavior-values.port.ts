export interface IUrlBehaviorValuesPort {
  nextHistoryId(): string;
  nextVersion(): string;
  currentInstant(): Date;
}

export interface IUrlBehaviorAccessPort {
  requireEditor(siteId: string, actorId: string): Promise<void>;
}
