export const mongoImage: string;

export function assertImageVersion(image: string, expected: string, built: string): void;

export function verifyReleaseConsistency(root: string): Promise<{ version: string; mongoImage: string }>;
