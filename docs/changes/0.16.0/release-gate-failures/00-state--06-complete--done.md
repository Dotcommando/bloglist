# Release gate failures

Bug fixes for CMS 0.16.0 on branch 0.16.0, based on `51e186e` with the
authorization coverage changes pending commit. The owner requested a green
unfiltered gate followed by commit and push. See [behavior](10-behavior.md),
[cases](40-cases.md) and [verification](50-verification.md).

The focused browser and rendering checks passed. The full unfiltered
administration release gate passed 196/196 with four workers, zero skips
and zero retries. The code and evidence are ready for the requested commit
and push.
