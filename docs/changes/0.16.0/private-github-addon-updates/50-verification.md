# Verification

The private release adapter test failed at the expected anonymous 404 before the
authenticated retry existed. After implementation the six focused suites passed
34 tests. They cover credentials stripped from redirects, scoped token minting,
malformed keys, rotation, public repositories and composition.

Seven integration tests passed in the existing repository installation and live
update suites with isolated MongoDB databases and a controlled GitHub peer. Real
Chrome exercised the private card check and activation under the System Admin
role and the unauthorized Site Admin path. The live GitHub smoke separately
installed the private published add-on in a temporary CMS via Chrome. It matched
the archive checksum and checked the current version.

`npm run format`, `npm run lint`, `npm run typecheck` and `npm run build` passed.
The administration build emitted its existing chunk-size advisory.
Production installation is outside this verification.

No confirmed CMS defects. No defect records required.
