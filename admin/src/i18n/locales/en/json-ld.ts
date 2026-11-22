export default {
  jsonLdProfileReadOnlyHint: 'You can view this profile. Ask for permission to save JSON-LD to change it or '
    + 'its assignments.',
  jsonLdAssignmentsJSONLDProfilesAndInputs: 'JSON-LD profiles and inputs',
  jsonLdAssignmentsCouldNotLoadProfiles: 'Could not load profiles.',
  jsonLdAssignmentsPageField: 'Page field',
  jsonLdAssignmentsSnippet: 'Snippet',
  jsonLdAssignmentsMissingObject: 'Missing object',
  jsonLdAssignmentsNoProfilesAssignedToThis: 'No profiles assigned to this template.',
  jsonLdAssignmentsRequiredValuesEditPageFields:
    '* Required values. Edit page fields and TVs below; manage shared references in JSON-LD.',
  jsonLdAssignmentsConfigureJSONLDProfilesAnd: 'Configure JSON-LD profiles and references',
  jsonLdSourceEditorSource: 'Source',
  jsonLdSourceEditorValue: 'Value',
  jsonLdSourceEditorFirstValueSecondValue: 'First value\nSecond value',
  jsonLdSourceEditorForExampleAName: 'For example, a name',
  jsonLdSourceEditorValueType: 'Value type',
  jsonLdSourceEditorListOneValuePerLine: 'List (one value per line)',
  jsonLdSourceEditorNumber: 'Number',
  jsonLdSourceEditorBoolean: 'Boolean',
  jsonLdSourceEditorNodeRole: 'Node role',
  jsonLdSourceEditorEntityPage: 'Entity page',
  jsonLdSourceEditorEntityRole: 'Entity role',
  jsonLdSourceEditorTVNameSnippetAlias: 'TV name / snippet alias',
  jsonLdSourceEditorPropertyPathDotSeparatedOptional: 'Property path (dot separated, optional)',
  jsonLdSourceEditorOrganizationPerson: 'Organization / person',
  jsonLdSourceEditorExactAddress: 'Exact address',
  jsonLdSourceEditorThisAddressRedirectsTheExact: 'This address redirects. The exact selected address is retained.',
  jsonLdSourceEditorAbsoluteHTTPSAddress: 'Absolute HTTP(S) address',
  jsonLdSourceEditorRequiredProperty: 'Required property',
  jsonLdSourceEditorCurrentPageNode: 'Current page node',
  jsonLdSourceEditorPageBackedEntity: 'Page-backed entity',
  jsonLdSourceEditorConstant: 'Constant',
  jsonLdSourceEditorTemplateVariable: 'Template variable',
  jsonLdSourceEditorPreparedSnippetValue: 'Prepared snippet value',
  jsonLdSourceEditorSharedObject: 'Shared object',
  jsonLdSourceEditorCurrentPageWebPage: 'Current page (WebPage)',
  jsonLdSourceEditorPageOfThisSite: 'Page of this site',
  jsonLdSourceEditorExactSiteAddress: 'Exact site address',
  jsonLdSourceEditorExternalAddress: 'External address',
  jsonLdSourceEditorUnpublished: 'Unpublished',
  jsonLdUrlEditorAddressSource: 'Address source',
  jsonLdUrlEditorAddressIsNotPublishedYet: 'Address is not published yet',
  jsonLdUrlEditorEnterAFullHTTPS: 'Enter a full HTTP(S) URL. Template tags are not evaluated here.',
  jsonLdValueSourceEditorPropertyPathDotSeparated: 'Property path (dot separated)',
  jsonLdSharedObjects: 'Shared objects',
  jsonLdSearchJSONLD: 'Search JSON-LD',
  jsonLdCreateFromPreset: 'Create from preset',
  jsonLdNoEntries: 'No entries',
  jsonLdBackToList: 'Back to list',
  jsonLdJSONLDHelp: 'JSON-LD help',
  jsonLdJSONLDGettingStarted: 'JSON-LD: getting started',
  jsonLdDescribeAPersonOrOrganization: '1. Describe a person or organization',
  jsonLdExampleAPrivatePsychologistIn: 'Example: a private psychologist. In Shared objects, press + and choose Person.',
  jsonLdListNameIsAnAdmin: 'List name is an admin-only label, such as Site author. Set the published name '
    + 'separately in the name property.',
  jsonLdExampleTextProperties: 'Example text properties:',
  jsonLdFullName: 'Full name',
  jsonLdPsychologist: 'Psychologist',
  jsonLdIndividualConsultations: 'Individual consultations',
  jsonLdForUrlChooseValueType: 'For url, choose value type Address, source Page of this site and the specialist’s page '
    + 'from the picker. CMS resolves its full published address.',
  jsonLdLinksToPagesThatUnambiguously:
    'links to pages that unambiguously identify the same person. In this example, use '
    + 'external profiles on other websites. Choose value type List and enter one full URL per '
    + 'line, without quotes or commas:',
  jsonLdUseUrlAndThePage: 'Use url and the page picker for the specialist’s page on this site. JSON-LD fields do '
    + 'not evaluate template tags such as ',
  jsonLdDoNotEnterThemIn: ': do not enter them in addresses, text or lists. Use a full HTTPS URL for an external '
    + 'address.',
  jsonLdForImageUseAPublic: 'For image, use a public photo address, for example',
  jsonLdAddOnlyActualPublicDetails: 'Add only actual public details and save the object.',
  jsonLdConfigureAPageProfile: '2. Configure a page profile',
  jsonLdInProfilesPressAndChoose: 'In Profiles, press + and choose Web page, Article or Service. Give the profile an '
    + 'admin-only name, such as Main pages. Assign the relevant HTML templates: the profile '
    + 'applies to every page using them.',
  jsonLdInSchemaOrgTypeIs: 'in Schema.org type is the standard web-page type, not a custom label. It appears in '
    + 'the public markup as ',
  jsonLdTheCorrespondingTypesArePerson: 'The corresponding types are Person for a person and Article for an article.',
  jsonLdInNodeRoleIsA: 'in Node role is a stable technical key within the profile. CMS uses it for references '
    + 'and the public @id. It is not the page title; keep it stable after configuring '
    + 'references.',
  jsonLdAPropertyDescribesTheNode:
    'A property describes the node; its source supplies the value. For WebPage, map name to '
    + 'page field title, description to metaDescription and inLanguage to language. For '
    + 'example, name receives the page title About the psychologist.',
  jsonLdForPagesAboutThePsychologist:
    'For pages about the psychologist, add about with Shared object as its source and pick '
    + 'the person. The reference includes that object in the graph; creating it alone does '
    + 'not add it to every page. Save the profile.',
  jsonLdIfTheSiteHasArticles: '3. If the site has articles',
  jsonLdForTheArticleTemplateConfigure:
    'For the article template, configure a profile containing WebPage and Article nodes. '
    + 'Add Article creates a starter article node.',
  jsonLdForArticleMapHeadlineTo: 'For Article, map headline to the page title, author to the shared person and '
    + 'mainEntityOfPage to Current page (WebPage). Enter author details once and reuse them.',
  jsonLdInspectAndPublish: '4. Inspect and publish',
  jsonLdSaveTheObjectProfileAnd: 'Save the object, profile and page first. In Pages, open the page, expand JSON-LD in '
    + 'the action bar and choose the draft JSON-LD view. Inspection uses the saved draft.',
  jsonLdResolvePropertyAndReferenceErrors:
    'Resolve property and reference errors, then publish the page or the entire site. '
    + 'Saving does not update the public site. Afterwards, inspect the published JSON-LD.',
  jsonLdMainPages: 'Main pages',
  jsonLdHTMLTemplates: 'HTML templates',
  jsonLdAddTemplate: 'Add template',
  jsonLdNodeRoleStableKey: 'Node role (stable key)',
  jsonLdStableKeyUsedByReferences: 'Stable key used by references and the public @id.',
  jsonLdSchemaOrgType: 'Schema.org type',
  jsonLdStandardTypePublishedAsType: 'Standard type; published as @type.',
  jsonLdEntityKey: 'Entity key',
  jsonLdPageAndRole: 'Page and role',
  jsonLdFromASource: 'From a source',
  jsonLdNodePresence: 'Node presence',
  jsonLdAlways: 'Always',
  jsonLdFromABooleanValue: 'From a boolean value',
  jsonLdEntityKeySource: 'Entity key source',
  jsonLdStableStringASCIILettersDigits:
    'Stable string: 1–128 ASCII letters, digits, hyphens or underscores. The same role and '
    + 'key identify one entity across this site’s pages.',
  jsonLdNodePresenceCondition: 'Node presence condition',
  jsonLdNodePresenceSource: 'Node presence source',
  jsonLdTrueIncludesTheNodeFalse:
    'true includes the node. false or a missing value omits it before checking its properties.',
  jsonLdAuthor: 'Author',
  jsonLdProvider: 'Provider',
  jsonLdNotSpecified: 'Not specified',
  jsonLdChooseAPersonOrOrganization: 'Choose a person or organization from Shared objects, when applicable.',
  jsonLdProperty: 'Property',
  jsonLdAddProperty: 'Add property',
  jsonLdRemoveNode: 'Remove node',
  jsonLdNode: 'Node',
  jsonLdAddNode: 'Add node',
  jsonLdAddArticle: 'Add Article',
  jsonLdListName: 'List name',
  jsonLdSiteAuthor: 'Site author',
  jsonLdList: 'List',
  jsonLdObject: 'Object',
  jsonLdAddress: 'Address',
  jsonLdRelatedObject: 'Related object',
  jsonLdValuesOnePerLine: 'Values (one per line)',
  jsonLdChooseAProfileOrShared: 'Choose a profile or shared object. Changes remain drafts until a page is published.',
  jsonLdPerson: 'Person',
  jsonLdOrganization: 'Organization',
  jsonLdWebPage: 'Web page',
  jsonLdArticle: 'Article',
  jsonLdService: 'Service',
  jsonLdWebSite: 'Web site',
  jsonLdCustomType: 'Custom type',
  jsonLdAnotherEditorChangedThisCatalog:
    'Another editor changed this catalog. Your fields are retained here. Copy your changes '
    + 'before refreshing.',
  jsonLdCheckThePropertiesReferencesAnd:
    'Check the properties, references and selected HTML templates. Your input is retained '
    + 'in the editor.',
  jsonLdReplaceUnsavedChanges: 'Replace unsaved changes?',
  jsonLdDraftSavedPublishingAPage: 'Draft saved. Publishing a page updates related published graphs together.',
  jsonLdDeleteDependentReferencesRemainFor:
    'Delete? Dependent references remain for correction and will be checked on publication.',
  jsonLdForExampleText: 'For example, text',
};
