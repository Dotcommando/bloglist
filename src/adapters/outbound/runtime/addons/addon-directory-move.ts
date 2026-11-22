import { rename } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

export async function moveAddonDirectory(from: string, to: string,
  move: (from: string, to: string) => Promise<void> = rename,
  pause: (milliseconds: number) => Promise<void> = delay): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await move(from, to);

      return;
    } catch (error) {
      if (
        attempt >= 4
        || !(error instanceof Error && 'code' in error
        && ['EPERM', 'EBUSY'].includes(String(error.code)))
      ) {
        throw error;
      }
      await pause(25 * 2 ** attempt);
    }
  }
}
