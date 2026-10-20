import type { IClusterBlogPosition } from './cluster-blog-position.js';

export function validateClusterBlogPositions(positions: readonly IClusterBlogPosition[]): void {
  const blogs = new Set<string>();

  for (const entry of positions) {
    if (typeof entry.blogId !== 'string' || !entry.blogId.trim()) {
      throw new RangeError('Blog identity is required');
    }
    if (!Number.isFinite(entry.position)) {
      throw new RangeError('Position must be finite');
    }
    if (blogs.has(entry.blogId)) {
      throw new RangeError('A blog may appear only once in a position update');
    }

    blogs.add(entry.blogId);
  }
}
