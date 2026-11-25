# Existing behavior

Files and the picker use `FileBrowser`. Its loading label occupies a grid row
between the toolbar and results, shifting the rows and pager during refresh.
Both entry points already use paginated reads, guard the latest result and keep
the previous result on failure. The Bloglist add-on uses the CMS spinner styles
and centers its overlay within its browse scrollport.
