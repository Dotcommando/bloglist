export function migrationFailureDiagnostic(error: unknown): string | null {
  const migration = error instanceof Error
    ? /^Missing or modified migration: (\d{4}-[a-z0-9-]+)$/.exec(error.message)?.[1]
    : undefined;

  return migration
    ? `Required migration is missing or modified: ${migration}. Run npm run migrate to apply pending migrations; existing migration checksums must remain unchanged.`
    : null;
}
