# Existing behavior

The media browser shared labels across the Files workspace and file pickers.
Cards and rows used CSS end truncation. The folder drawer used its own 13px
labels. `MiddleEllipsis` already measured the display width with the rendered
font and refreshed after changes to the available area or fonts. Bloglist uses
measured candidate strings that reserve the required address fragments.
