import { readLocalSettings } from './infra/local-application.settings.js';
import { migrateMediaLayout } from './infra/media/migrate-media-layout.js';

try {
  const [flag, from, ...extra] = process.argv.slice(2);

  if (flag !== '--from' || !from || extra.length) {
    throw new Error('Usage: npm run migrate:media -- --from <previous-media-root>');
  }

  const copied = await migrateMediaLayout(readLocalSettings(process.env), from);

  console.info('Media layout migrated; verified and copied ' + copied + ' immutable objects.');
} catch {
  console.error('Media layout migration failed. Check roots, checksums and pending file operations.');
  process.exitCode = 1;
}
