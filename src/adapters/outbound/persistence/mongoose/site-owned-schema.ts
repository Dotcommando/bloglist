function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value)) : {};
}

/** A validator guarantees ownership when every accepted document must have a siteId. */
export function requiresSiteId(value: unknown): boolean {
  const validator = object(value);
  const required = object(validator.$jsonSchema).required;

  return Array.isArray(required) && required.includes('siteId')
    || Array.isArray(validator.$and) && validator.$and.some(requiresSiteId)
    || Array.isArray(validator.$or) && validator.$or.length > 0 && validator.$or.every(requiresSiteId);
}
