# Design

Use separate control and pagination rows, with an equal-height preview cell
for image and icon tiles. Store the setting alongside the media layout
preference in local browser storage, keyed by site. Hidden browsers cancel
pending requests and read the preference when shown again.
