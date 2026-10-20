export interface IBlogLookupPort {
  exists(blogId: string): Promise<boolean>;
}
