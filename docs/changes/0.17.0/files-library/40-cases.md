# Verification cases

- P1. A file replacement leaves a sibling's bytes untouched and does not read
  its underlying asset. Adapter test in `file-library-projection.spec.ts`.
- P2. Rename, delete, and repeat an already applied delta. Check public path
  results and preservation of immutable objects in the same adapter suite.
- P3. A stale callback performs no writes. Reuse the projection fence regression.
- P4. A preparation failure leaves existing named files and allows retry.
  Verify in the projection adapter suite.
- P5. Validate the persisted journal and recovery on the MongoDB adapter path.
  Retain the existing integration suite for authorization and public delivery.
- P6. Serve concurrent GET and HEAD while a replacement is staged. Verify
  stable URL and ID, old bytes before promotion and a new ETag afterwards.
- P7. Keep unrelated public reads available during real bulk projection,
  discard a definitively rejected asset and reuse a deleted address.
- P8. Recover an empty marker left by a crashed writer and prove exclusive
  access from several independent processes on Windows.
- P9. Open Files in Chrome with 100,000 rows. Verify 25 entries and bounded
  browse requests. Measure real projection and batch lookups separately.
- P10. Install an add-on, upload through its host facade, reject ordinary
  deletion and remap its declared file ID when restoring into another site.
- P11. Restore an add-on with replaced logo bytes on the original or a second
  site. After force deletion, export keeps the affected business row and reports
  the missing file. Same-site restore preserves the ID. Cross-site restore
  omits the unresolved optional field after explicit selection.
- P12. Interrupt content replacement, occupy the old file address, and retry
  after releasing it. Interrupt publication, restart CMS and retry again.
- P13. Edit a card opened before a concurrent importer advanced the catalogue.
  Check replacement, move and rejection of a stale revision of that same file.
- P14. Upload a valid PNG through a JPEG-only picker. Check that no logical file
  or private asset is stored and ordinary Files can upload the PNG.
