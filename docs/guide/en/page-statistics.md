# Page statistics

Open a site, then Settings / Page statistics. The table shows the most requested
paths first, with call count, average, median, p95 and p99 in milliseconds.
The domain and query values are not recorded.

Today is selected initially. Choose the last seven/thirty days, or a custom date
range using the calendar, then Show results. Dates follow the site's configured
time zone. Custom endpoints are inclusive. Records are retained for 90 days.

All CMS versions are combined initially. Select a version to compare releases.
More filters separates static/dynamic pages, HTML/Markdown, GET/HEAD and outcomes.
The default includes successful GETs. Errors, redirects and disconnections are
retained and can be selected separately. Refresh does not save or publish content.

The main duration measures response preparation on the server. It excludes
network transfer and writing the statistics, which happens after the response.
It is not the browser's loading time. Median means half the requests were faster;
p95/p99 mean 95%/99% completed within that time. Interpret small sample counts
with care. A warning identifies losses reported by the current server process.

An empty table can mean no traffic for the selected dates/filters, or disabled
recording. An operator controls recording with ZARYA_PAGE_DIAGNOSTICS. Existing
statistics remain readable when it is disabled. See the private operational
contract in [page resolution statistics](../../arch/page-resolution-statistics.md).
