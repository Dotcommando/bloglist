<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';

  import { messages } from '../../i18n/i18n';
  import Checkbox from '../../shared/ui/Checkbox.svelte';
  import ReferencePicker from '../../shared/ui/ReferencePicker.svelte';
  import type { IUrlCatalog } from '../urls/urls.types';
  import {
    type IJsonLdMapping, type IJsonLdNode, type IJsonLdObject, type IJsonLdProfile, JsonLdSourceKind as Kind,
  } from './json-ld-api';
  import { JSON_LD_PAGE_FIELDS, JsonLdPageField } from './json-ld-page-fields';

  let { mapping = $bindable(), objects, urls, nodes, profiles }: {
    mapping: IJsonLdMapping;
    objects: IJsonLdObject[];
    nodes: IJsonLdNode[];
    profiles: IJsonLdProfile[];
    urls: IUrlCatalog | null;
  } = $props();
  const id = $props.id();
  const labels = $derived({
    currentNode: $messages.jsonLdSourceEditorCurrentPageNode,
    pageEntity: $messages.jsonLdSourceEditorPageBackedEntity,
    constant: $messages.jsonLdSourceEditorConstant,
    pageField: $messages.jsonLdAssignmentsPageField,
    templateVariable: $messages.jsonLdSourceEditorTemplateVariable,
    snippet: $messages.jsonLdSourceEditorPreparedSnippetValue,
    sharedObject: $messages.jsonLdSourceEditorSharedObject,
    currentPage: $messages.jsonLdSourceEditorCurrentPageWebPage,
    page: $messages.jsonLdSourceEditorPageOfThisSite,
    exactUrl: $messages.jsonLdSourceEditorExactSiteAddress,
    externalUrl: $messages.jsonLdSourceEditorExternalAddress,
  });
  const pageChoices = $derived((urls?.pages ?? []).map((page) => ({
    value: page.pageId,
    label: page.title + ' · ' + (urls?.published?.routes.find((route) => route.pageId === page.pageId)?.path
      ?? ($messages.jsonLdSourceEditorUnpublished)),
  })));
  const urlChoices = $derived((urls?.urls ?? []).map(({ url }) => ({
    value: url.urlId,
    label: url.path + ' · ' + url.kind,
  })));

  function changeKind(kind: Kind): void {
    mapping.source = { kind, ...(kind === Kind.Constant ? { value: '' } : {}) };
  }

  function selectUrl(urlId: string): void {
    const visited = new SvelteSet<string>();
    let url = urls?.urls.find(({ url }) => url.urlId === urlId)?.url;

    while (url?.redirectTargetUrlId && !visited.has(url.urlId)) {
      visited.add(url.urlId);
      const next = url.redirectTargetUrlId;

      url = urls?.urls.find(({ url }) => url.urlId === next)?.url;
    }
    mapping.source.pageId = url?.pageId ?? '';
  }
</script>

<div class="mapping-source">
  <div class="_jsonld-source-fields">
  <div class="_form-field">
  <label for={id + '-kind'}>{$messages.jsonLdSourceEditorSource}</label>
  <select id={id + '-kind'} value={mapping.source.kind} onchange={(event) => {
    const kind = Object.values(Kind).find((kind) => kind === event.currentTarget.value);

    if (kind) {
      changeKind(kind);
    }
  }}>
    {#each Object.values(Kind) as kind (kind)}<option value={kind}>{labels[kind]}</option>{/each}
  </select>
  </div>
  <div class="_form-field">
  {#if mapping.source.kind === Kind.Constant}
    <label for={id + '-value'}>{$messages.jsonLdSourceEditorValue}</label>
    {#if Array.isArray(mapping.source.value)}
      <textarea id={id + '-value'} value={mapping.source.value.join('\n')}
        placeholder={$messages.jsonLdSourceEditorFirstValueSecondValue} oninput={(event) => {
          mapping.source.value = event.currentTarget.value.split('\n');
        }}></textarea>
    {:else}
    <input id={id + '-value'} value={String(mapping.source.value ?? '')}
      placeholder={typeof mapping.source.value === 'number' ? '42' : typeof mapping.source.value === 'boolean'
        ? 'true' : $messages.jsonLdSourceEditorForExampleAName} oninput={(event) => {
          const text = event.currentTarget.value;

          mapping.source.value = typeof mapping.source.value === 'number' ? Number(text)
            : typeof mapping.source.value === 'boolean' ? text === 'true' : text;
        }} />
    {/if}
    <select aria-label={$messages.jsonLdSourceEditorValueType}
      value={Array.isArray(mapping.source.value) ? 'array' : typeof mapping.source.value}
      onchange={(event) => {
        mapping.source.value = event.currentTarget.value === 'number' ? 0
          : event.currentTarget.value === 'boolean' ? false : event.currentTarget.value === 'array' ? [] : '';
      }}>
      <option value="array">{$messages.jsonLdSourceEditorListOneValuePerLine}</option>
      <option value="string">{$messages.tvText}</option>
      <option value="number">{$messages.jsonLdSourceEditorNumber}</option>
      <option value="boolean">{$messages.jsonLdSourceEditorBoolean}</option>
    </select>
  {:else if mapping.source.kind === Kind.CurrentNode}
    <ReferencePicker label={$messages.jsonLdSourceEditorNodeRole} items={nodes.map((node) => ({
      value: node.role, label: node.role + ' · ' + node.type,
    }))} bind:value={mapping.source.role} />
  {:else if mapping.source.kind === Kind.PageEntity}
    <ReferencePicker label={$messages.jsonLdSourceEditorEntityPage} items={pageChoices}
      bind:value={mapping.source.pageId} />
    <ReferencePicker label={$messages.jsonLdSourceEditorEntityRole}
      items={Array.from(new Map(profiles.flatMap((profile) =>
        profile.nodes).filter((node) => !['author', 'publisher', 'provider'].includes(mapping.property)
        || ['Person', 'Organization'].includes(node.type)).map((node) => [node.role, {
        value: node.role, label: node.role + ' · ' + node.type,
      }])).values())} bind:value={mapping.source.role} />
  {:else if mapping.source.kind === Kind.PageField}
    <label for={id + '-field'}>{$messages.jsonLdAssignmentsPageField}</label>
    <select id={id + '-field'} value={mapping.source.name === 'description'
      ? JsonLdPageField.MetaDescription : mapping.source.name}
      onchange={(event) => {
        mapping.source.name = event.currentTarget.value;
      }}>
      <option value="">—</option>
      {#each JSON_LD_PAGE_FIELDS as name (name)}
        <option value={name}>{name}</option>
      {/each}
    </select>
  {:else if mapping.source.kind === Kind.TemplateVariable || mapping.source.kind === Kind.Snippet}
    <label for={id + '-name'}>{$messages.jsonLdSourceEditorTVNameSnippetAlias}</label>
    <input id={id + '-name'} bind:value={mapping.source.name}
      placeholder={mapping.source.kind === Kind.TemplateVariable ? 'specialistName' : 'publicProfile'} />
    <label for={id + '-path'}>
      {$messages.jsonLdSourceEditorPropertyPathDotSeparatedOptional}</label>
    <input id={id + '-path'} value={mapping.source.path?.join('.') ?? ''} placeholder="profile.name"
      oninput={(event) => {
        mapping.source.path = event.currentTarget.value ? event.currentTarget.value.split('.') : [];
      }} />
  {:else if mapping.source.kind === Kind.SharedObject}
    <ReferencePicker label={$messages.jsonLdSourceEditorOrganizationPerson}
      items={objects.map((object) => ({ value: object.objectId, label: object.name + ' · ' + object.type }))}
      bind:value={mapping.source.objectId} />
  {:else if mapping.source.kind === Kind.Page}
    <ReferencePicker label={$messages.urlPage} items={pageChoices} bind:value={mapping.source.pageId} />
  {:else if mapping.source.kind === Kind.ExactUrl}
    <ReferencePicker label={$messages.jsonLdSourceEditorExactAddress} items={urlChoices}
      bind:value={mapping.source.urlId} onchange={selectUrl} />
    {#if urls?.urls.find(({ url }) => url.urlId === mapping.source.urlId)?.url.redirectTargetUrlId}
      <p role="status">{$messages.jsonLdSourceEditorThisAddressRedirectsTheExact}</p>
    {/if}
  {:else if mapping.source.kind === Kind.ExternalUrl}
    <label for={id + '-url'}>{$messages.jsonLdSourceEditorAbsoluteHTTPSAddress}</label>
    <input id={id + '-url'} type="url" bind:value={mapping.source.url} placeholder="https://example.test/about/" />
  {/if}
  </div>
  </div>
  <Checkbox bind:checked={mapping.required}>{$messages.jsonLdSourceEditorRequiredProperty}</Checkbox>
</div>

<style>
  .mapping-source { display: grid; gap: 16px; min-width: 0; }
  ._jsonld-source-fields { display: grid; gap: 16px 20px; min-width: 0; }
  @media (min-width: 992px) {
    ._jsonld-source-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
  }
</style>
