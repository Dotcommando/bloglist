<script lang="ts">
  import { tick, untrack } from 'svelte';

  import { type AdminMessageKey, messages } from '../../i18n/i18n';
  import type { IAdminSite } from '../../shared/api/content.types';
  import { ContentRequestError } from '../../shared/api/content-api';
  import { scrollShadow } from '../../shared/browser/scroll-shadow';
  import CreateButton from '../../shared/ui/CreateButton.svelte';
  import ReferencePicker from '../../shared/ui/ReferencePicker.svelte';
  import RefreshButton from '../../shared/ui/RefreshButton.svelte';
  import type { CanUseAction } from '../access/site-actions';
  import { ElementKind, type IRenderingElement } from '../rendering/rendering.types';
  import { listElements } from '../rendering/rendering-api';
  import type { IUrlCatalog } from '../urls/urls.types';
  import { getUrlCatalog } from '../urls/urls-api';
  import {
    type IJsonLdCatalog,
    type IJsonLdNode,
    type IJsonLdObject,
    type IJsonLdProfile,
    JsonLdPreset as Preset,
    JsonLdSourceKind,
    JsonLdTab as Tab,
    loadJsonLdCatalog, saveJsonLdCatalog,
  } from './json-ld-api';
  import { JsonLdPageField } from './json-ld-page-fields';
  import JsonLdSourceEditor from './JsonLdSourceEditor.svelte';
  import JsonLdTypeIcon from './JsonLdTypeIcon.svelte';
  import JsonLdUrlEditor from './JsonLdUrlEditor.svelte';
  import JsonLdValueSourceEditor from './JsonLdValueSourceEditor.svelte';

  let creationOpen = $state(false);

  function presetName(preset: Preset): string {
    const labels = {
      [Preset.Person]: $messages.jsonLdPerson,
      [Preset.Organization]: $messages.jsonLdOrganization,
      [Preset.WebPage]: $messages.jsonLdWebPage,
      [Preset.Article]: $messages.jsonLdArticle,
      [Preset.Service]: $messages.jsonLdService,
    };

    return labels[preset];
  }

  function profileType(profile: IJsonLdProfile): string {
    const mainEntity = profile.nodes.flatMap((node) => node.mappings)
      .find((mapping) => mapping.property === 'mainEntity' && mapping.source.kind === JsonLdSourceKind.CurrentNode);
    const main = profile.nodes.find((node) => node.role === mainEntity?.source.role)
      ?? profile.nodes.find((node) => node.type !== Preset.WebPage) ?? profile.nodes[0];

    return main?.type ?? '';
  }

  function typeLabel(type: string): string {
    const preset = Object.values(Preset).find((value) => value === type);
    const label = preset ? presetName(preset) : type === 'WebSite' ? $messages.jsonLdWebSite
      : $messages.jsonLdCustomType;

    return label === type ? type : label + ' · ' + type;
  }

  let { can, site, active, desktop, requestedProfileId, onUnauthorized, onBusy, onDirtyChange }: {
    can: CanUseAction;
    site: IAdminSite;
    active: boolean;
    desktop: boolean;
    requestedProfileId: string | null;
    onUnauthorized: () => void;
    onBusy: (busy: boolean) => void;
    onDirtyChange: (dirty: boolean) => void;
  } = $props();
  const canSave = $derived(can('cms.json-ld.save'));
  let catalog = $state<IJsonLdCatalog | null>(null);
  let saved = $state('');
  let loading = $state(false);
  let busy = $state(false);
  let error = $state<AdminMessageKey | ''>('');
  let notice = $state<AdminMessageKey | ''>('');
  const id = $props.id();
  let tab = $state<Tab>(Tab.Profiles);
  const presets = $derived(tab === Tab.Objects
    ? [Preset.Person, Preset.Organization] : [Preset.WebPage, Preset.Article, Preset.Service]);

  function switchTab(value: Tab): void {
    creationOpen = false;
    tab = value;
    selected = '';
    editor = false;
  }

  function tabKeydown(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const value = event.key === 'Home' ? Tab.Profiles : event.key === 'End' ? Tab.Objects
      : tab === Tab.Profiles ? Tab.Objects : Tab.Profiles;

    switchTab(value);
    document.getElementById(id + '-' + value)?.focus();
  }
  let selected = $state('');
  let openedProfileId = $state<string | null>(null);
  let query = $state('');
  let editor = $state(false);
  let templates = $state<IRenderingElement[]>([]);
  let urls = $state<IUrlCatalog | null>(null);
  const profile = $derived(tab === Tab.Profiles
    ? catalog?.profiles.find((item) => item.profileId === selected) : undefined);
  const entity = $derived(tab === Tab.Objects
    ? catalog?.objects.find((item) => item.objectId === selected) : undefined);
  const dirty = $derived(catalog !== null && JSON.stringify(catalog) !== saved);
  const entries = $derived((tab === Tab.Profiles ? catalog?.profiles.map((item) => ({
    id: item.profileId,
    name: item.name,
    type: profileType(item),
  })) : catalog?.objects.map((item) => ({ id: item.objectId, name: item.name, type: item.type })))
    ?.filter((item) => (item.name + ' ' + item.type).toLocaleLowerCase()
      .includes(query.toLocaleLowerCase())) ?? []);

  $effect(() => {
    onDirtyChange(dirty);
  });
  $effect(() => {
    if (active && !catalog && !loading) {
      untrack(() => {
        void refresh();
      });
    }
  });

  $effect(() => {
    if (!active || !requestedProfileId) {
      openedProfileId = null;
    } else if (
      requestedProfileId !== openedProfileId
      && catalog?.profiles.some((profile) => profile.profileId === requestedProfileId)
    ) {
      tab = Tab.Profiles;
      selected = requestedProfileId;
      editor = true;
      openedProfileId = requestedProfileId;
    }
  });

  function failure(value: unknown): void {
    if (value instanceof ContentRequestError && value.status === 401) {
      onUnauthorized();
    } else {
      error = value instanceof ContentRequestError && value.status === 409
        ? 'jsonLdAnotherEditorChangedThisCatalog'
        : 'jsonLdCheckThePropertiesReferencesAnd';
    }
  }

  async function refresh(): Promise<void> {
    if (loading || dirty && !window.confirm($messages.jsonLdReplaceUnsavedChanges)) {
      return;
    }
    loading = true;
    error = '';

    try {
      const result = await Promise.all([
        loadJsonLdCatalog(site.siteId),
        can('cms.templates.list') ? listElements(site.siteId, ElementKind.Template) : Promise.resolve([]),
        can('cms.urls.list') ? getUrlCatalog(site.siteId) : Promise.resolve(null),
      ]);

      catalog = result[0];
      saved = JSON.stringify(catalog);
      templates = result[1];
      urls = result[2];
    } catch (value) {
      failure(value);
    } finally {
      loading = false;
    }
  }

  async function save(): Promise<void> {
    if (!catalog || busy) {
      return;
    }
    busy = true;
    onBusy(true);
    error = '';
    notice = '';

    try {
      const result = await saveJsonLdCatalog(catalog);

      catalog = result;
      saved = JSON.stringify(result);
      notice = 'jsonLdDraftSavedPublishingAPage';
    } catch (value) {
      failure(value);
    } finally {
      busy = false;
      onBusy(false);
    }
  }

  async function toggleCreation(): Promise<void> {
    if (!catalog || busy) {
      return;
    }
    creationOpen = !creationOpen;

    if (creationOpen) {
      await tick();
      document.getElementById(id + '-preset-0')?.focus();
    }
  }

  function presetKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      creationOpen = false;
      document.getElementById(id + '-create')?.focus();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? presets.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + presets.length) % presets.length;

      document.getElementById(id + '-preset-' + target)?.focus();
    }
  }

  function create(preset: Preset): void {
    if (!catalog || busy) {
      return;
    }

    const createdId = crypto.randomUUID();

    if (preset === Preset.Person || preset === Preset.Organization) {
      catalog.objects.push({
        objectId: createdId,
        name: presetName(preset),
        type: preset,
        properties: {
          name: { kind: 'text', value: '' },
          description: { kind: 'text', value: '' },
          ...(preset === Preset.Person ? { jobTitle: { kind: 'text', value: '' } } : {}),
          sameAs: { kind: 'list', value: [] },
        },
      });
    } else {
      const webpage: IJsonLdNode = {
        role: 'webpage',
        type: Preset.WebPage,
        mappings: [
          { property: 'name', required: true, source: { kind: JsonLdSourceKind.PageField, name: 'title' } },
          {
            property: 'description',
            required: false,
            source: { kind: JsonLdSourceKind.PageField, name: JsonLdPageField.MetaDescription },
          },
          { property: 'inLanguage', required: false, source: { kind: JsonLdSourceKind.PageField, name: 'language' } },
        ],
      };
      const profile: IJsonLdProfile = {
        profileId: createdId,
        name: presetName(preset),
        templateIds: [],
        nodes: [webpage],
      };

      if (preset === Preset.Article || preset === Preset.Service) {
        const role = preset === Preset.Article ? 'article' : 'service';

        webpage.mappings.push({
          property: 'mainEntity',
          required: true,
          source: { kind: JsonLdSourceKind.CurrentNode, role },
        });
        profile.nodes.push({
          role,
          type: preset,
          mappings: [
            {
              property: preset === Preset.Article ? 'headline' : 'name',
              required: true,
              source: { kind: JsonLdSourceKind.PageField, name: 'title' },
            },
            {
              property: 'description',
              required: false,
              source: { kind: JsonLdSourceKind.PageField, name: JsonLdPageField.MetaDescription },
            },
            { property: 'mainEntityOfPage', required: true, source: { kind: JsonLdSourceKind.CurrentPage } },
          ],
        });
      }
      catalog.profiles.push(profile);
    }
    creationOpen = false;
    query = '';
    selected = createdId;
    editor = true;
    void tick().then(() => document.getElementById(id + '-editor')?.querySelector<HTMLInputElement>('input')?.focus());
  }

  function relatedProperty(node: IJsonLdNode): string {
    return node.type === Preset.Article ? 'author' : 'provider';
  }

  function relatedObject(node: IJsonLdNode): string {
    const source = node.mappings.find((mapping) => mapping.property === relatedProperty(node))?.source;

    return source?.kind === JsonLdSourceKind.SharedObject ? source.objectId ?? '' : '';
  }

  function selectRelatedObject(node: IJsonLdNode, objectId: string): void {
    if (objectId && !catalog?.objects.some((object) => object.objectId === objectId)) {
      return;
    }

    const property = relatedProperty(node);
    const index = node.mappings.findIndex((mapping) => mapping.property === property);

    if (!objectId) {
      if (index >= 0) {
        node.mappings.splice(index, 1);
      }

      return;
    }

    const mapping = {
      property,
      required: index >= 0 ? node.mappings[index]!.required : false,
      source: { kind: JsonLdSourceKind.SharedObject, objectId },
    };

    if (index >= 0) {
      node.mappings[index] = mapping;
    } else {
      node.mappings.push(mapping);
    }
  }

  function remove(): void {
    if (!catalog) {
      return;
    }

    const message = $messages.jsonLdDeleteDependentReferencesRemainFor;

    if (!window.confirm(message)) {
      return;
    }
    catalog.profiles = catalog.profiles.filter((item) => item.profileId !== selected);
    catalog.objects = catalog.objects.filter((item) => item.objectId !== selected);
    selected = '';
    editor = false;
  }

  function exampleValue(property: string): string {
    const examples: Record<string, string> = {
      name: $messages.jsonLdFullName,
      jobTitle: $messages.jsonLdPsychologist,
      description: $messages.jsonLdIndividualConsultations,
      sameAs: 'https://directory.example.test/people/anna',
      image: 'https://example.test/assets/images/portrait.webp',
    };

    return examples[property] ?? $messages.jsonLdForExampleText;
  }

  function addProperty(object: IJsonLdObject): void {
    let index = 1;

    while (Object.hasOwn(object.properties, 'property' + index)) {
      index++;
    }
    object.properties['property' + index] = { kind: 'text', value: '' };
  }

  function renameProperty(object: IJsonLdObject, key: string, name: string): void {
    if (name === key || Object.hasOwn(object.properties, name)) {
      return;
    }
    object.properties = Object.fromEntries(Object.entries(object.properties).map(([property, value]) => [
      property === key ? name : property, value,
    ]));
  }

  function addArticle(value: IJsonLdProfile): void {
    if (value.nodes.some((node) => node.role === 'article')) {
      return;
    }
    value.nodes.push({
      role: 'article',
      type: 'Article',
      mappings: [
        { property: 'headline', required: true, source: { kind: JsonLdSourceKind.PageField, name: 'title' } },
        { property: 'mainEntityOfPage', required: true, source: { kind: JsonLdSourceKind.CurrentPage } },
      ],
    });
  }
</script>

{#snippet addIcon()}
  <svg class="cms-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
{/snippet}
{#snippet deleteIcon()}
  <svg class="cms-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
  </svg>
{/snippet}
{#snippet saveIcon()}
  <svg class="cms-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 3h12l4 4v14H3V3h2M7 3v6h10V3M7 21v-8h10v8" />
  </svg>
{/snippet}

<div class="json-ld-workspace" class:inactive={!active}>
  <aside class="page-drawer" class:mobile-hidden={!desktop && editor} aria-label="JSON-LD">
    <div class="_drawer-heading">
      <div class="_drawer-context">
        <span class="_setup-kicker">{site.primaryDomain}</span>
        <button class="cms-circle" type="button" aria-label={$messages.openWorkspace} aria-controls={id + '-editor'}
          onclick={() => {
            editor = true;
          }}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </button>
      </div>
      <div class="_drawer-title-row"><h2>JSON-LD</h2></div>
      <div class="cms-tabs" role="tablist" aria-label="JSON-LD">
        {#each [Tab.Profiles, Tab.Objects] as value (value)}
          <button class="cms-tab" type="button" role="tab" id={id + '-' + value}
            aria-selected={tab === value} aria-controls={id + '-list'} tabindex={tab === value ? 0 : -1}
            onkeydown={tabKeydown} onclick={() => switchTab(value)}>
            {value === Tab.Profiles ? $messages.calibrationProfiles : $messages.jsonLdSharedObjects}
          </button>
        {/each}
      </div>
      <input aria-label={$messages.jsonLdSearchJSONLD} bind:value={query} />
      <div class="_form-actions _form-actions__inline">
        {#if canSave}<CreateButton label={$messages.adminUsersCreate} disabled={!catalog || busy}
        id={id + '-create'} controls={id + '-presets'} expanded={creationOpen} onclick={() => {
          void toggleCreation();
        }} />{/if}<RefreshButton disabled={loading || busy}
        onclick={() => {
          void refresh();
        }} /></div>
    {#if creationOpen}
      <div class="_jsonld-presets" id={id + '-presets'} role="group"
        aria-label={$messages.jsonLdCreateFromPreset}>
        <p>{$messages.jsonLdCreateFromPreset}</p>
        {#each presets as preset, index (preset)}
          <button class="cms-secondary cms-icon-button" type="button" id={id + '-preset-' + index}
            disabled={busy} onkeydown={(event) => presetKeydown(event, index)} onclick={() => create(preset)}>
            {@render addIcon()}<span class="cms-drawer-label">{presetName(preset)}</span>
            <JsonLdTypeIcon type={preset} label={typeLabel(preset)} />
          </button>
        {/each}
      </div>
    {/if}
    </div>
    <div use:scrollShadow class="_tree-scroll" role="tabpanel" id={id + '-list'} aria-labelledby={id + '-' + tab}>
      {#if loading}<p role="status">{$messages.loadingElements}</p>{/if}
      <ul class="json-ld-list">
        {#each entries as item (item.id)}
          <li><button type="button" aria-current={selected === item.id ? 'true' : undefined}
            aria-label={item.name + ' · ' + item.type} title={item.name + ' · ' + typeLabel(item.type)}
            onclick={() => {
              selected = item.id;
              editor = true;
            }}><span class="cms-drawer-label">{item.name}</span>
            <JsonLdTypeIcon type={item.type} label={typeLabel(item.type)} /></button></li>
        {/each}
      </ul>
      {#if !loading && !entries.length}<p>{$messages.jsonLdNoEntries}</p>{/if}
    </div>
  </aside>
  <main id={id + '-editor'} class="json-ld-editor" class:mobile-hidden={!desktop && !editor}>
    <div class="_workspace-toolbar">
      {#if !desktop}<button class="cms-circle" type="button" aria-label={$messages.jsonLdBackToList}
        onclick={() => {
          editor = false;
        }}>‹</button>{/if}
      <h1 class="_workspace-title">{profile?.name ?? entity?.name ?? 'JSON-LD'}</h1>
      {#if canSave}<div class="_form-actions _form-actions__inline">
        <button class="cms-secondary cms-icon-button" type="button"
                  disabled={!selected || busy} onclick={remove}>
          {@render deleteIcon()}{$messages.accessSettingsDelete}</button>
        <button class="cms-secondary cms-icon-button" type="button"
                  disabled={!dirty || busy} onclick={() => {
                    void save();
                  }}>
          {@render saveIcon()}{$messages.accessSettingsSave}</button>
      </div>{/if}
    </div>
    <div use:scrollShadow class="_workspace-scroll">
      <div class="json-ld-form">
        {#if error}<p class="cms-error" role="alert">{$messages[error]}</p>{/if}
        {#if notice}<p class="cms-success" role="status">{$messages[notice]}</p>{/if}
        <section class="element-help _jsonld-help" aria-label={$messages.jsonLdJSONLDHelp}>
          <details class="_element-syntax">
            <summary>{$messages.jsonLdJSONLDGettingStarted}</summary>
            <dl class="_syntax-list">
              <div>
                <dt>{$messages.jsonLdDescribeAPersonOrOrganization}</dt>
                <dd>
                  <p>{$messages.jsonLdExampleAPrivatePsychologistIn}</p>
                  <p>{$messages.jsonLdListNameIsAnAdmin}</p>
                  <p>{$messages.jsonLdExampleTextProperties}
                    <code>name</code> — {$messages.jsonLdFullName};
                    <code>jobTitle</code> — {$messages.jsonLdPsychologist};
                    <code>description</code> — {$messages.jsonLdIndividualConsultations}.</p>
                  <p>{$messages.jsonLdForUrlChooseValueType}</p>
                  <p><code>sameAs</code> — {$messages.jsonLdLinksToPagesThatUnambiguously}</p>
                  <p><code>https://directory.example.test/people/anna</code><br />
                    <code>https://social.example.test/anna</code></p>
                  <p>{$messages.jsonLdUseUrlAndThePage}
                    <code>[[~52]]</code>{$messages.jsonLdDoNotEnterThemIn}</p>
                  <p>{$messages.jsonLdForImageUseAPublic}
                    <code>https://example.test/assets/images/portrait.webp</code>.
                    {$messages.jsonLdAddOnlyActualPublicDetails}</p>
                </dd>
              </div>
              <div>
                <dt>{$messages.jsonLdConfigureAPageProfile}</dt>
                <dd>
                  <p>{$messages.jsonLdInProfilesPressAndChoose}</p>
                  <p><code>WebPage</code> {$messages.jsonLdInSchemaOrgTypeIs}
                    <code>"@type": "WebPage"</code>.
                    {$messages.jsonLdTheCorrespondingTypesArePerson}</p>
                  <p><code>webpage</code> {$messages.jsonLdInNodeRoleIsA}</p>
                  <p>{$messages.jsonLdAPropertyDescribesTheNode}</p>
                  <p>{$messages.jsonLdForPagesAboutThePsychologist}</p>
                </dd>
              </div>
              <div>
                <dt>{$messages.jsonLdIfTheSiteHasArticles}</dt>
                <dd>
                  <p>{$messages.jsonLdForTheArticleTemplateConfigure}</p>
                  <p>{$messages.jsonLdForArticleMapHeadlineTo}</p>
                </dd>
              </div>
              <div>
                <dt>{$messages.jsonLdInspectAndPublish}</dt>
                <dd>
                  <p>{$messages.jsonLdSaveTheObjectProfileAnd}</p>
                  <p>{$messages.jsonLdResolvePropertyAndReferenceErrors}</p>
                </dd>
              </div>
            </dl>
          </details>
        </section>
        {#if profile && !canSave}<p class="_jsonld-field-hint">{$messages.jsonLdProfileReadOnlyHint}</p>{/if}
        <fieldset class="_jsonld-permission-fields" disabled={!canSave}>
        {#if profile}
          <label>{$messages.calibrationProfileName}<input bind:value={profile.name} maxlength="200"
            placeholder={$messages.jsonLdMainPages} /></label>
          <h2>{$messages.jsonLdHTMLTemplates}</h2>
          {#each profile.templateIds as templateId, index (index)}
            <div class="assignment">
              <ReferencePicker label={$messages.template} items={templates.map((item) => ({
                value: item.id, label: item.name,
              }))} value={templateId} onchange={(value) => {
                if (profile) {
                  profile.templateIds[index] = value;
                }
              }} />
              <button class="cms-secondary cms-icon-button" type="button"
                  onclick={() => profile?.templateIds.splice(index, 1)}>
                {@render deleteIcon()}{$messages.accessSettingsDelete}</button>
            </div>
          {/each}
          <button class="cms-secondary cms-icon-button" type="button"
                  onclick={() => profile?.templateIds.push('')}>
            {@render addIcon()}{$messages.jsonLdAddTemplate}</button>
          {#each profile.nodes as node, nodeIndex (nodeIndex)}
            <section class="node">
              <div class="_jsonld-node-settings">
              <div class="two-columns">
                <label>
                  {$messages.jsonLdNodeRoleStableKey}
                  <input bind:value={node.role} placeholder="webpage"
                    aria-label={$messages.jsonLdNodeRoleStableKey}
                    aria-describedby={id + '-role-' + nodeIndex} />
                  <small class="_jsonld-field-hint" id={id + '-role-' + nodeIndex}>
                    {$messages.jsonLdStableKeyUsedByReferences}</small></label>
                <label>{$messages.jsonLdSchemaOrgType}<input bind:value={node.type} placeholder="WebPage"
                    aria-label={$messages.jsonLdSchemaOrgType}
                    aria-describedby={id + '-type-' + nodeIndex} />
                  <small class="_jsonld-field-hint" id={id + '-type-' + nodeIndex}>
                    {$messages.jsonLdStandardTypePublishedAsType}</small></label>
              </div>
              <div class="two-columns">
                <label>{$messages.jsonLdEntityKey}
                  <select aria-label={$messages.jsonLdEntityKey}
                    value={node.keySource ? 'source' : 'page'} onchange={(event) => {
                      if (event.currentTarget.value === 'source') {
                        node.keySource = { kind: JsonLdSourceKind.Snippet, name: '', path: [] };
                      } else {
                        delete node.keySource;
                      }
                    }}>
                    <option value="page">{$messages.jsonLdPageAndRole}</option>
                    <option value="source">{$messages.jsonLdFromASource}</option>
                  </select>
                </label>
                <label>{$messages.jsonLdNodePresence}
                  <select aria-label={$messages.jsonLdNodePresence}
                    value={node.presenceSource ? 'source' : 'always'} onchange={(event) => {
                      if (event.currentTarget.value === 'source') {
                        node.presenceSource = { kind: JsonLdSourceKind.Snippet, name: '', path: [] };
                      } else {
                        delete node.presenceSource;
                      }
                    }}>
                    <option value="always">{$messages.jsonLdAlways}</option>
                    <option value="source">{$messages.jsonLdFromABooleanValue}</option>
                  </select>
                </label>
              </div>
              {#if node.keySource}
                <section class="_jsonld-node-source"
                  aria-label={$messages.jsonLdEntityKeySource}>
                  <JsonLdValueSourceEditor bind:source={node.keySource}
                    label={$messages.jsonLdEntityKeySource} />
                  <p class="_jsonld-field-hint">{$messages.jsonLdStableStringASCIILettersDigits}</p>
                </section>
              {/if}
              {#if node.presenceSource}
                <section class="_jsonld-node-source"
                  aria-label={$messages.jsonLdNodePresenceCondition}>
                  <JsonLdValueSourceEditor bind:source={node.presenceSource} boolean
                    label={$messages.jsonLdNodePresenceSource} />
                  <p class="_jsonld-field-hint">{$messages.jsonLdTrueIncludesTheNodeFalse}</p>
                </section>
              {/if}
              </div>
              {#if (node.type === Preset.Article || node.type === Preset.Service)
                && node.mappings.every((mapping) => mapping.property !== relatedProperty(node)
                  || mapping.source.kind === JsonLdSourceKind.SharedObject)}
                <div class="_jsonld-related">
                  <ReferencePicker label={node.type === Preset.Article ? $messages.jsonLdAuthor
                    : $messages.jsonLdProvider}
                    items={[{ value: '', label: $messages.jsonLdNotSpecified },
                      ...(catalog?.objects ?? []).map((object) => ({
                        value: object.objectId, label: object.name + ' · ' + object.type,
                      }))]}
                    value={relatedObject(node)} onchange={(objectId) => selectRelatedObject(node, objectId)} />
                  <small>{$messages.jsonLdChooseAPersonOrOrganization}</small>
                </div>
              {/if}
              {#each node.mappings as mapping, index (index)}
                <div class="mapping">
                  <label>{$messages.jsonLdProperty}
                    <input bind:value={mapping.property} placeholder="name" /></label>
                  <JsonLdSourceEditor bind:mapping={node.mappings[index]!} objects={catalog?.objects ?? []}
                    nodes={profile.nodes} profiles={catalog?.profiles ?? []} {urls} />
                  <button class="cms-secondary cms-icon-button" type="button"
                  onclick={() => node.mappings.splice(index, 1)}>
                {@render deleteIcon()}{$messages.accessSettingsDelete}</button>
                </div>
              {/each}
              <div class="_form-actions _form-actions__inline">
                <button class="cms-secondary cms-icon-button" type="button"
                  aria-label={$messages.jsonLdAddProperty}
                  onclick={() => node.mappings.push({
                    property: '', required: false, source: { kind: JsonLdSourceKind.Constant, value: '' },
                  })}>
                  {@render addIcon()}
                  <span class="_jsonld-action-full">{$messages.jsonLdAddProperty}</span>
                  <span class="_jsonld-action-compact" aria-hidden="true">{$messages.jsonLdProperty}</span></button>
                <button class="cms-secondary cms-icon-button" type="button"
                  aria-label={$messages.jsonLdRemoveNode}
                  onclick={() => profile?.nodes.splice(nodeIndex, 1)}>
                  {@render deleteIcon()}<span class="_jsonld-action-full">{$messages.jsonLdRemoveNode}</span>
                  <span class="_jsonld-action-compact" aria-hidden="true">{$messages.jsonLdNode}</span></button>
              </div>
            </section>
          {/each}
          <div class="_form-actions _form-actions__inline">
            <button class="cms-secondary cms-icon-button" type="button"
                  aria-label={$messages.jsonLdAddNode}
                  onclick={() => profile?.nodes.push({
                    role: '', type: 'WebSite', mappings: [],
                  })}>
                  {@render addIcon()}
                  <span class="_jsonld-action-full">{$messages.jsonLdAddNode}</span>
                  <span class="_jsonld-action-compact" aria-hidden="true">{$messages.jsonLdNode}</span></button>
            <button class="cms-secondary cms-icon-button" type="button"
              aria-label={$messages.jsonLdAddArticle}
                  onclick={() => {
                    if (profile) {
                      addArticle(profile);
                    }
                  }}>
              {@render addIcon()}<span class="_jsonld-action-full">{$messages.jsonLdAddArticle}</span>
                  <span class="_jsonld-action-compact" aria-hidden="true">Article</span></button>
          </div>
        {:else if entity}
          <div class="two-columns">
            <label>{$messages.jsonLdListName}<input bind:value={entity.name} maxlength="200"
              placeholder={$messages.jsonLdSiteAuthor} /></label>
            <label>{$messages.tvType}<select bind:value={entity.type}>
              <option>Organization</option><option>Person</option>
            </select></label>
          </div>
          {#each Object.entries(entity.properties) as [property, value], index (index)}
            <section class="mapping">
              <div class="two-columns">
              <label>{$messages.jsonLdProperty}<input value={property} placeholder="name" onchange={(event) => {
                if (entity) {
                  renameProperty(entity, property, event.currentTarget.value);
                }
              }} /></label>
              <label>{$messages.jsonLdSourceEditorValueType}<select value={value.kind} onchange={(event) => {
                if (entity) {
                  entity.properties[property] = event.currentTarget.value === 'node'
                    ? { kind: 'node', key: '', required: true } : event.currentTarget.value === 'url'
                      ? { kind: 'url', required: true, reference: { kind: 'external', url: '' } }
                      : {
                        kind: event.currentTarget.value,
                        value: event.currentTarget.value === 'number' ? 0
                          : event.currentTarget.value === 'boolean' ? false
                            : event.currentTarget.value === 'list' ? [] : '',
                      };
                }
              }}>
                <option value="text">{$messages.tvText}</option>
                <option value="number">{$messages.jsonLdSourceEditorNumber}</option>
                <option value="boolean">{$messages.jsonLdSourceEditorBoolean}</option>
                <option value="list">{$messages.jsonLdList}</option>
                <option value="node">{$messages.jsonLdObject}</option>
                <option value="url">{$messages.jsonLdAddress}</option></select></label>
              </div>
              {#if value.kind === 'node'}
                <ReferencePicker label={$messages.jsonLdRelatedObject}
                  items={(catalog?.objects ?? []).map((item) => ({ value: item.objectId, label: item.name }))}
                  bind:value={value.key} />
              {:else if value.kind === 'url' && value.reference}
                <JsonLdUrlEditor bind:value={entity.properties[property]!} {urls} />
              {:else if value.kind === 'list' && Array.isArray(value.value)}
                <label>{$messages.jsonLdValuesOnePerLine}
                  <textarea value={value.value.join('\n')}
                    placeholder={property === 'sameAs'
                      ? 'https://directory.example.test/people/anna\nhttps://social.example.test/anna'
                      : $messages.jsonLdSourceEditorFirstValueSecondValue} oninput={(event) => {
                        value.value = event.currentTarget.value.split('\n');
                      }}></textarea></label>
              {:else}
                <label>{$messages.jsonLdSourceEditorValue}<input value={String(value.value ?? '')}
                  placeholder={value.kind === 'number' ? '42'
                    : value.kind === 'boolean' ? 'true' : exampleValue(property)}
                  oninput={(event) => {
                    value.value = value.kind === 'number' ? Number(event.currentTarget.value)
                      : value.kind === 'boolean' ? event.currentTarget.value === 'true' : event.currentTarget.value;
                  }} /></label>
              {/if}
              <button class="cms-secondary cms-icon-button" type="button"
                  onclick={() => {
                    if (entity) {
                      delete entity.properties[property];
                    }
                  }}>
                {@render deleteIcon()}{$messages.accessSettingsDelete}</button>
            </section>
          {/each}
          <button class="cms-secondary cms-icon-button" type="button"
            aria-label={$messages.jsonLdAddProperty}
                  onclick={() => {
                    if (entity) {
                      addProperty(entity);
                    }
                  }}>
            {@render addIcon()}<span class="_jsonld-action-full">{$messages.jsonLdAddProperty}</span>
                  <span class="_jsonld-action-compact" aria-hidden="true">{$messages.jsonLdProperty}</span></button>
        {:else}
          <p>{$messages.jsonLdChooseAProfileOrShared}</p>
        {/if}
        </fieldset>
      </div>
    </div>
  </main>
</div>

<style>
  .json-ld-workspace { display: flex; min-width: 0; min-height: 0; flex: 1; overflow: hidden; }
  .inactive, .mobile-hidden { display: none; }
  .json-ld-editor { min-width: 0; min-height: 0; display: flex; flex: 1; flex-direction: column; }
  .json-ld-editor.mobile-hidden { display: none; }
  .json-ld-form { width: 100%; }
  ._jsonld-permission-fields { border: 0; padding: 0; margin: 0; min-width: 0; }
  ._jsonld-help p { margin: 8px 0; }
  ._jsonld-field-hint { font-size: 12px; font-weight: 400; line-height: 1.5; color: var(--cms-muted); }
  ._jsonld-action-full { display: none; }
  ._jsonld-action-compact { display: inline; }
  @media (min-width: 576px) {
    ._jsonld-action-full { display: inline; }
    ._jsonld-action-compact { display: none; }
  }
  .json-ld-form label { font-size: 13px; font-weight: 600; }
  .json-ld-form :global(._form-field) { margin-bottom: 0; }
  .json-ld-form :global(textarea) { width: 100%; min-height: 88px; padding: 12px 14px;
    border: 1px solid #ced3cc; border-radius: 7px; background: var(--cms-surface);
    color: var(--cms-ink); font: inherit; }
  .json-ld-form label { display: grid; gap: 8px; min-width: 0; }
  .json-ld-form input, .json-ld-form select { width: 100%; min-height: 44px; }
  .json-ld-form textarea { width: 100%; min-height: 88px; }
  .json-ld-form :global(._form-field) { min-width: 0; }
  .two-columns { display: grid; grid-template-columns: minmax(0, 1fr); gap: 24px; }
  ._jsonld-node-settings { display: grid; gap: 28px; min-width: 0; }
  ._jsonld-node-source { display: grid; gap: 12px; min-width: 0; }
  ._jsonld-node-source > ._jsonld-field-hint { margin: 0; }
  .assignment { display: flex; align-items: end; flex-wrap: wrap; gap: 12px; }
  .assignment { margin-bottom: 16px; }
  .assignment > :global(div) { flex: 1; }
  .node { margin-block: 40px; }
  .mapping { margin-block: 24px; padding: 20px; background: #f3f5ef; display: grid; gap: 12px; }
  .mapping > button { justify-self: start; }
  ._jsonld-presets { display: grid; gap: 8px; }
  ._jsonld-presets p { margin: 0; color: var(--cms-muted); font-size: 13px; }
  ._jsonld-presets > button { justify-content: start; }
  ._jsonld-related { display: grid; gap: 8px; margin-block: 20px; }
  ._jsonld-related small { font-size: 12px; line-height: 1.6; color: var(--cms-muted); }
  .json-ld-list { margin: 0; padding: 0; list-style: none; }
  .json-ld-list button { display: flex; align-items: center; gap: 8px; min-width: 0; width: 100%;
    padding: 12px; margin-bottom: 6px; border: 1px solid transparent;
    border-radius: 5px; background: #e8ede2; text-align: left; overflow-wrap: anywhere; }
  .json-ld-list button:hover { background: #dce5d3; }
  .json-ld-list [aria-current="true"] { border-color: #47694c; }
  @media (min-width: 768px) {
    .two-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
