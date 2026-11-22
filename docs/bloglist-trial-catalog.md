# Bloglist trial catalog

This consuming installation runs CMS Zarya 0.15.1 and the selected Bloglist
0.4.1 runtime. The add-on source lives in the separate zarya-addon-bloglist
project; the immutable installed artifact is selected through the CMS registry.

- Public home: http://localhost:3003/
- Administration: http://localhost:3002/admin/
- Public collections: /technology/, /workshop/, /travel/, /food/, /ecology/, /books/.

The catalog contains 36 fictional bloggers, 97 blogs, six new clusters and 18
query phrases. The original two users, 500 clusters including their primaryQuery
values, and three system pages were preserved. The technology collection has 37
blogs; each other collection has 12. One team owns 27 blogs to exercise child
pagination. The remaining bloggers each own two blogs.

Use Bloglist -> Clusters to change the selected blogs and their manual order.
Public cards read these selections and public descriptions on each request,
without page republication. Contacts and private notes are never returned.
Normal page/markup/SEO/URL changes still require publication.

The theme is editable in Templates/Chunks/Snippets, using the Catalog_ names.
Catalog_Home and Catalog_Listing are the page templates. Typed Request Snippets
Catalog_Home_Data and Catalog_Collection_Data call the installed extension.
The listing page's declared bloglistClusterId rendering parameter identifies its
cluster. Page identity and URLs remain native CMS entities. Editable entity
backups live under sites/bloglist/elements; site.config.json declares the q,
page and platform request inputs. There is no startup seed or business source
registration in the CMS distribution.

The public design uses topic navigation and numbered editorial lists inspired
by Feedspot, with original markup, styling and fictional content. All external
links point to reserved example.com URLs. A visible demo notice and noindex
metadata prevent presenting the fixture as a real public directory.

Verified on the installed runtime: seven public routes, search/platform filters,
pagination, live description edits without publication, selection add/remove and
ordering, and blogger child pagination. Chrome layouts were checked from 320 to
1440 CSS px, including breakpoint edges; no horizontal overflow or browser errors
were observed. Physical iPhone Safari and production load were not tested.

Start the installation from the IDE with npm run start:http. Existing private
.env, database and users are retained. Do not rerun the old setup/reset tools.
