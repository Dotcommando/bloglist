# Existing behavior

The media list used a flex row with an icon and an intrinsically sized label
grid. The common label fitter measured its own rendered box and reserved the
file ending. The new Chrome geometry assertions show the text crossing its
visible boundary in the old build while its text still included the suffix.
