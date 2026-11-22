export default {
  saveApply: 'Save & apply',
  newSnippet: 'New snippet',
  snippetUsage: 'Call this snippet from a template or chunk and bind the result with &as:',
  serverSource: 'Server TypeScript',
  snippetCodeHint: 'Write an async function body: input contains declared parameters; context contains '
    + 'siteId, pageId, language and the published page catalog. Return typed JSON data. Node '
    + 'services, imports, environment variables and network APIs are unavailable.',
  snippetPhases: 'Execution phases',
  snippetParallelRead: 'Allow parallel reads (CMS commands disabled)',
  snippetCacheEnabled: 'Allow public document caching (CMS commands disabled)',
  snippetCacheMaxAge: 'Maximum accepted data age, seconds',
  snippetCacheHint: 'Only public inputs and data; no personalization or side effects. Call '
    + 'context.cache.bypass() for a fallback result.',
  snippetOutput: 'Result contract',
  paginationDescription: 'Included with Zarya. Lists published direct child pages in the current language. '
    + 'Defaults to 10 per page; navigation uses ?page=1. Invalid pages select 1; pages beyond '
    + 'the end select the last page.',
  paginationTemplateHint: 'Select the bundled Pagination template and Request delivery in page publication '
    + 'settings. parentId defaults to the current page. Edit the Pagination item/link chunks '
    + 'to customize the output. Republish the site after changing the child list.',
  elementName: 'Element name',
  elementUsage: 'Using this element',
  chunkUsage: 'Use the chunk “{name}” in a template:',
  chunkUsageUnsaved: 'Save the chunk “{name}” to get its inclusion tag.',
  chunkReferenceStable: 'Update name-based calls after renaming; key-based calls keep working.',
  chunkReferenceOr: 'Or by key:',
  chunkNameUnavailable: 'For this name, use the key tag. Name tags support letters, digits, spaces, _, . and -.',
  chunkNameCollision: 'This name conflicts with another chunk reference. Use the key tag or choose a unique name.',
  chunkNameRules: 'Spaces become underscores; names are case-sensitive. If names collide, use the key. An '
    + 'exact key takes precedence over a name.',
  realChunkParameters: 'This chunk’s parameters',
  parameterValueHelp: 'A dot in a placeholder selects a field of an object parameter; it is not a separate '
    + 'editor field. Parameters declares types and defaults. An argument in a chunk call '
    + 'overrides its default. A Snippet result is computed data: change editable Snippet code '
    + 'in Snippets, or pass editable text into a backend integration.',
  parameterFromCaller: 'No default: the caller must supply required values. The schema does not store a '
    + 'Snippet’s returned text.',
  parameterCallExample: 'Call example using this parameter (supply other required parameters too):',
  editParameterDefaults: 'Edit parameter defaults',
  parameterCallers: 'Used by these entities: open the source to find the call or its data binding.',
  chunkParameterExample: 'Pass a parameter',
  chunkParameterDeclaration: 'In Parameters, add title with type String. Then:',
  insideChunk: 'Inside the chunk:',
  insideTemplate: 'In the template (pass the page title):',
  templateUsage: 'Select the template “{name}” in a page’s publication settings.',
  sourceSyntax: 'Chunks and snippets: syntax',
  chunkReference: 'Include a chunk',
  pageValues: 'Page fields',
  buildLoader: 'Snippet at publication',
  buildLoaderHint: 'Runs during publication; its result stays frozen until republishing.',
  requestLoader: 'Snippet per HTTP request',
  requestLoaderHint: 'Only for pages configured for request rendering and snippets supporting that phase.',
  loaderResult: 'Read the result',
  loaderResultHint: 'data is a local alias from &as, not an editor section. value is a declared field '
    + 'returned by that Snippet. Edit its code in Snippets if it is an editable entity. '
    + 'Registered backend integrations are changed in site code; their returned fields are '
    + 'not editable parameter defaults.',
  loaderRegistrationHint: 'Snippet and ChunkKey are examples: use a registered backend snippet name and a chunk '
    + 'key or name with spaces replaced by _. Add the snippet’s required parameters. Snippets '
    + 'are connected on the backend.',
  newTemplate: 'New template',
  newChunk: 'New chunk',
  selectElement: 'Select an element',
  selectElementHint: 'Open an element from the list or create one with “+”.',
  searchElements: 'Search by name or number',
  openElementList: 'Open element list',
  noElements: 'No matching elements',
  htmlSource: 'HTML',
  cssSource: 'CSS',
  scriptSource: 'Browser TypeScript',
  parameter: 'Parameter',
  parameterName: 'Name',
  parameterType: 'Type',
  parameterRequired: 'Required',
  parameterNullable: 'Allow null',
  parameterHasDefault: 'Use a default value',
  parameterDefault: 'Default value',
  parameterDefaultNull: 'Use null as default',
  parameterDefaultInvalid: 'Enter a valid JSON value for this type.',
  parameterEnumValues: 'Allowed values, one per line',
  addParameter: 'Add parameter',
  removeParameter: 'Remove parameter',
  sourceDraftHint: 'Save & apply saves this element and publishes the entire site, updating all published '
    + 'pages that use it. Save draft keeps changes unpublished.',
  sourceSaved: 'Draft saved. The public site has not changed.',
  sourceSavedNeedsPublisher: 'Draft saved. Ask a site administrator with site publishing access to apply the changes.',
  sourceApplied: 'Changes saved and applied. Site published.',
  sourceApplyFailed: 'Draft saved. Applying changes could not be confirmed. Check the public site before '
    + 'trying again.',
  sourceApplyRejected: 'Draft saved. Publication was rejected. Fix the source and parameter contracts before '
    + 'applying.',
  unknownChunkParameter: 'Chunk {key}: parameter “{parameter}” is not declared. Add it in the chunk’s Parameters tab.',
  missingChunkParameter: 'Chunk {key}: required parameter “{parameter}” was not passed. Add it to the call after ?.',
  missingParameterSeparator: '{source}: add ? before tag arguments, for example [[$1? &title=`Value`]].',
  chunkDiagnosticSource: 'Chunk {key}',
  templateDiagnosticSource: 'Template {key}',
  openDiagnosticSource: 'Open the indicated element',
  sourceUnsaved: 'Unsaved changes',
  sourceConflict: 'This element has changed elsewhere. Your input is kept; open the current version '
    + 'before saving again.',
  sourceReload: 'Load current version',
  sourceReloadConfirm: 'Replace your unsaved input with the current saved version?',
  whereUsed: 'Where used',
  sourceUsageReadHint: 'To open a listed item, request read access to it.',
  notUsed: 'Not used yet',
  previewPage: 'Page for preview',
  sourcePreviewNeedsResult: 'To open a preview, request access to the generated preview.',
  sourcePreviewNeedsPage: 'To preview this source, you need access to a page that uses it.',
  backupPending: 'The source is saved in the database, but its file backup is incomplete. Retry the '
    + 'backup before editing.',
  retryBackup: 'Retry file backup',
};
