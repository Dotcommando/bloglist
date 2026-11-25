# Design

A separate icon column and a constrained text column establish the content
width inside each action. Inline size containment keeps the chosen text from
resizing the table column while the fitter measures it. Use the actual text
box width without integer rounding. Keep the existing filename rules, tooltip
and accessible name. The table can scroll if the metadata columns and minimum
name width need more room.

This presentation change touches no server requests, authority, filenames or
stored data.
