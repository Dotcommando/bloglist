<script lang="ts">
  import { messages } from '../../i18n/i18n';
  import { type IJsonLdSource, JsonLdSourceKind as Kind } from './json-ld-api';
  import { JSON_LD_PAGE_FIELDS } from './json-ld-page-fields';

  let { source = $bindable(), label, boolean = false }: {
    source: IJsonLdSource;
    label: string;
    boolean?: boolean;
  } = $props();
  const id = $props.id();
  const kinds = [Kind.Constant, Kind.PageField, Kind.TemplateVariable, Kind.Snippet] as const;
  const labels = $derived({
    [Kind.Constant]: $messages.jsonLdSourceEditorConstant,
    [Kind.PageField]: $messages.jsonLdAssignmentsPageField,
    [Kind.TemplateVariable]: $messages.jsonLdSourceEditorTemplateVariable,
    [Kind.Snippet]: $messages.jsonLdSourceEditorPreparedSnippetValue,
  });
</script>

<div class="source-fields" class:source-fields__prepared={source.kind === Kind.Snippet
  || source.kind === Kind.TemplateVariable}>
  <div class="_form-field source-kind">
    <label for={id + '-source'}>{label}</label>
    <select id={id + '-source'} aria-label={label} value={source.kind} onchange={(event) => {
      const kind = kinds.find((kind) => kind === event.currentTarget.value);

      if (kind) {
        source = { kind, ...(kind === Kind.Constant ? { value: boolean ? true : '' } : { name: '' }) };
      }
    }}>
      {#each kinds as kind (kind)}<option value={kind}>{labels[kind]}</option>{/each}
    </select>
  </div>
  {#if source.kind === Kind.Constant}
    <div class="_form-field">
      <label for={id + '-value'}>{$messages.jsonLdSourceEditorValue}</label>
      {#if boolean}
        <select id={id + '-value'} value={String(source.value)} onchange={(event) => {
          source.value = event.currentTarget.value === 'true';
        }}>
          <option value="true">true</option><option value="false">false</option>
        </select>
      {:else}
        <input id={id + '-value'} bind:value={source.value} maxlength="128" placeholder="entity-key" />
      {/if}
    </div>
  {:else if source.kind === Kind.PageField}
    <div class="_form-field">
      <label for={id + '-field'}>{$messages.jsonLdAssignmentsPageField}</label>
      <select id={id + '-field'} bind:value={source.name}>
        <option value="">—</option>
        {#each JSON_LD_PAGE_FIELDS as name (name)}<option value={name}>{name}</option>{/each}
      </select>
    </div>
  {:else}
    <div class="_form-field">
      <label for={id + '-name'}>{$messages.jsonLdSourceEditorTVNameSnippetAlias}</label>
      <input id={id + '-name'} bind:value={source.name} placeholder="nearest" />
    </div>
    <div class="_form-field">
      <label for={id + '-path'}>{$messages.jsonLdValueSourceEditorPropertyPathDotSeparated}</label>
      <input id={id + '-path'} value={source.path?.join('.') ?? ''}
        placeholder={boolean ? 'present' : 'sessionId'} oninput={(event) => {
          source.path = event.currentTarget.value ? event.currentTarget.value.split('.') : [];
        }} />
    </div>
  {/if}
</div>

<style>
  .source-fields { display: grid; grid-template-columns: minmax(0, 1fr); gap: 24px; min-width: 0; }
  .source-fields ._form-field { justify-content: flex-end; gap: 8px; margin: 0; }
  .source-fields label { font-size: 13px; font-weight: 600; }
  .source-fields input, .source-fields select { width: 100%; min-width: 0; }
  @media (min-width: 768px) {
    .source-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .source-fields__prepared > .source-kind { grid-column: 1 / -1; }
  }
</style>
