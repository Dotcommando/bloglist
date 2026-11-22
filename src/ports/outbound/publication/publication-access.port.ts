export interface IPublicationAccessPort {
  assertEditor(siteId: string, actorId?: string): Promise<void>;
}
