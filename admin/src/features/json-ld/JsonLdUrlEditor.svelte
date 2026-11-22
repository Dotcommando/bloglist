<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';

  import { messages } from '../../i18n/i18n';
  import ReferencePicker from '../../shared/ui/ReferencePicker.svelte';
  import type { IUrlCatalog } from '../urls/urls.types';
  import type { IJsonLdValue } from './json-ld-api';

  let { value = $bindable(), urls }: { value: IJsonLdValue; urls: IUrlCatalog | null } = $props();
  const id = $props.id();
  const pageChoices = $derived((urls?.pages ?? []).map((page) => ({
    value: page.pageId,
    label: page.title + ' · ' + (urls?.published?.routes.find((route) => route.pageId === page.pageId)?.path
      ?? ($messages.jsonLdSourceEditorUnpublished)),
  })));
  const urlChoices = $derived((urls?.urls ?? []).map(({ url }) => ({
    value: url.urlId,
    label: url.path + ' · ' + url.kind,
  })));

  function selectUrl(urlId: string): void {
    const visited = new SvelteSet<string>();
    let selected = urls?.urls.find(({ url }) => url.urlId === urlId)?.url;

    while (selected?.redirectTargetUrlId && !visited.has(selected.urlId)) {
      visited.add(selected.urlId);
      const targetId = selected.redirectTargetUrlId;

      selected = urls?.urls.find(({ url }) => url.urlId === targetId)?.url;
    }

    if (value.reference) {
      value.reference.pageId = selected?.pageId ?? '';
    }
  }
</script>

{#if value.reference}
  <label for={id + '-source'}>{$messages.jsonLdUrlEditorAddressSource}</label>
  <select id={id + '-source'} value={value.reference.kind} onchange={(event) => {
    const kind = event.currentTarget.value;

    value.reference = kind === 'page' ? { kind, pageId: '' }
      : kind === 'exact' ? { kind, urlId: '', pageId: '' } : { kind: 'external', url: '' };
  }}>
    <option value="page">{$messages.jsonLdSourceEditorPageOfThisSite}</option>
    <option value="exact">{$messages.jsonLdSourceEditorExactSiteAddress}</option>
    <option value="external">{$messages.jsonLdSourceEditorExternalAddress}</option>
  </select>
  {#if value.reference.kind === 'page'}
    <ReferencePicker label={$messages.urlPage} items={pageChoices} bind:value={value.reference.pageId} />
    {#if value.reference.pageId}
      <p role="status">{urls?.published?.routes.find((route) => route.pageId === value.reference?.pageId)?.path
        ?? ($messages.jsonLdUrlEditorAddressIsNotPublishedYet)}</p>
    {/if}
  {:else if value.reference.kind === 'exact'}
    <ReferencePicker label={$messages.jsonLdSourceEditorExactAddress} items={urlChoices}
      bind:value={value.reference.urlId} onchange={selectUrl} />
    {#if urls?.urls.find(({ url }) => url.urlId === value.reference?.urlId)?.url.redirectTargetUrlId}
      <p role="status">{$messages.jsonLdSourceEditorThisAddressRedirectsTheExact}</p>
    {/if}
  {:else}
    <label for={id + '-url'}>{$messages.jsonLdSourceEditorAbsoluteHTTPSAddress}</label>
    <input id={id + '-url'} type="url" bind:value={value.reference.url} placeholder="https://example.test/about/" />
    <small>{$messages.jsonLdUrlEditorEnterAFullHTTPS}</small>
  {/if}
{/if}
