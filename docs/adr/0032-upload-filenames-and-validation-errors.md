# ADR 0032: Copied filenames and precise upload errors

Date: 2026-10-28

Status: Accepted through the owner's CSV/XLSX upload failure and request for exact
validation messages on 2026-10-28.

Portable file/folder names accept parentheses, including ordinary copied names
such as `report (2).xlsx`. Retain the existing 180 UTF-16-unit limit, leading
letter/digit rule, whitespace/dot restrictions, extension requirement for files,
Windows reserved-name rejection, uniqueness and site/path ownership checks.
No automatic renaming or rewriting of uploaded bytes is introduced.

The media capability exposes stable validation issues for invalid, too-long and
reserved names; empty files; image/document byte limits; unsupported extensions;
content/extension mismatch; CSV encoding/control content; invalid JSON; and invalid
images. HTTP returns only the safe issue code, never parser exceptions or private
storage details. Name/format/content failures return 400; size failures return 413.
CSV remains UTF-8, documents remain limited to 64 MiB and images to 20 MiB.

Files administration translates these codes into English/Russian explanations and
includes the failed upload's filename. Browser checks distinguish empty files,
image/document size limits and read failures. The server still validates actual
bytes independently. Failed queue entries remain available for cancellation or
retry; successful earlier entries retain their acknowledged library versions.

Regression coverage includes CSV and a synthetic XLSX workbook with copied names,
public byte/MIME round trips, domain name rejection, HTTP error translation and
visible browser messages for name, size, extension, content and CSV encoding.
