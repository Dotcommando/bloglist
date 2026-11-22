<script lang="ts">
  import { followAdminLink, renderingUsagePath, sitePath } from '../../app/admin-route';
  import { messages } from '../../i18n/i18n';
  import {
    chunkNameAlias, ElementKind, type IParameterField, type IRenderingElement, ParameterKind,
  } from './rendering.types';

  let { element, elements, busy }: {
    element: IRenderingElement;
    elements: readonly IRenderingElement[];
    busy: boolean;
  } = $props();
  const chunk = $derived(element.kind === ElementKind.Chunk);
  const snippet = $derived(element.kind === ElementKind.Snippet);
  const name = $derived(element.name.trim() || (chunk ? $messages.newChunk : $messages.newTemplate));
  const alias = $derived(chunk ? chunkNameAlias(element.name) : null);
  const colliding = $derived(alias !== null && alias !== element.id && elements.some((other) =>
    other.kind === ElementKind.Chunk && other.id !== element.id
    && (other.id === alias || chunkNameAlias(other.name) === alias)));
  const keyReference = $derived('[[$' + (chunk && element.id ? element.id : 'ChunkKey') + ']]');
  const reference = $derived(chunk && alias && !colliding ? '[[$' + alias + ']]' : keyReference);
  const parameterExample = $derived(reference.slice(0, -2) + '? &title=`[[*title]]`]]');

  const realParameters = $derived(chunk ? element.parameters.filter((field) => field.name) : []);
  const parametersHref = $derived(element.id
    ? sitePath(element.siteId) + '/chunks/' + encodeURIComponent(element.id) + '?file=parameters' : null);

  function paths(field: IParameterField, prefix = ''): string[] {
    const name = prefix + field.name;

    return field.kind === ParameterKind.Object && field.properties?.length
      ? field.properties.flatMap((child) => paths(child, name + '.')) : [name];
  }

  function example(field: IParameterField): string {
    const value = field.defaultValue === undefined || field.defaultValue === null
      || field.kind === ParameterKind.Object || field.kind === ParameterKind.Array
      ? '[[+' + field.name + ']]' : String(field.defaultValue);

    return reference.slice(0, -2) + '? &' + field.name + '=`'
      + value.replaceAll('\\', '\\\\').replaceAll('`', '\\`') + '`]]';
  }

</script>

<section class="element-help" aria-label={$messages.elementUsage}>
  <p class="_element-usage">
    {#if snippet}
      {$messages.snippetUsage}
      <code>{'[[' + (element.snippet?.phases.includes('Request') ? '!' : '')
        + (chunkNameAlias(element.name) || element.id || 'Snippet')
        + (element.id === 'Pagination' ? '? &page=`[[+request.page]]` &as=`pagination`]]'
          : '? &as=`data`]]')}</code>
      {#if element.id}<code>{'[[' + (element.snippet?.phases.includes('Request') ? '!' : '')
        + element.id + '? &as=`data`]]'}</code>{/if}
      {#if element.id === 'Pagination'}<span>{$messages.paginationDescription}</span>
        <span>{$messages.paginationTemplateHint}</span>{/if}
    {:else if chunk && !element.id}
      {$messages.chunkUsageUnsaved.replace('{name}', () => name)}
    {:else if chunk}
      {$messages.chunkUsage.replace('{name}', () => name)} <code>{reference}</code>.
      {#if reference !== keyReference}{$messages.chunkReferenceOr} <code>{keyReference}</code>.{/if}
      {$messages.chunkReferenceStable}
      {#if !alias}<span>{$messages.chunkNameUnavailable}</span>{/if}
      {#if colliding}<span>{$messages.chunkNameCollision}</span>{/if}
    {:else}
      {$messages.templateUsage.replace('{name}', () => name)}
    {/if}
  </p>
  <details class="_element-syntax">
    <summary>{$messages.sourceSyntax}</summary>
    <dl class="_syntax-list">
      <div><dt>{$messages.chunkReference}</dt><dd><code>{reference}</code>
        <span>{$messages.chunkNameRules}</span></dd></div>
      {#if realParameters.length}
        <div><dt>{$messages.realChunkParameters}</dt><dd>
          <p>{$messages.parameterValueHelp}</p>
          {#each realParameters as field, index (index)}
            <p><strong>{field.name}</strong> ({field.kind})</p>
            {#each paths(field) as parameterPath, pathIndex (pathIndex)}
              <code>{'[[+' + parameterPath + ']]'}</code>
            {/each}
            {#if Object.hasOwn(field, 'defaultValue')}
              <span>{$messages.parameterDefault}: <strong>{typeof field.defaultValue === 'object'
                ? JSON.stringify(field.defaultValue) : String(field.defaultValue)}</strong></span>
            {:else}<span>{$messages.parameterFromCaller}</span>{/if}
            <span>{$messages.parameterCallExample}</span><code>{example(field)}</code>
          {/each}
          {#if parametersHref}
            <p><a href={parametersHref} onclick={followAdminLink}>{$messages.editParameterDefaults}</a></p>
          {/if}
          {#if element.usages.length}
            <p>{$messages.parameterCallers}</p>
            <ul>{#each element.usages as usage (usage.kind + ':' + usage.id)}
              <li>{#if usage.readable && !busy}
                <a href={renderingUsagePath(element.siteId, usage.kind, usage.id)}
                  onclick={followAdminLink}>{usage.title || usage.id}</a>
              {:else}{usage.title || usage.id}{/if}</li>
            {/each}</ul>
            {#if element.usages.some((usage) => !usage.readable)}<p>{$messages.sourceUsageReadHint}</p>{/if}
          {/if}
        </dd></div>
      {:else}
      <div><dt>{$messages.chunkParameterExample}</dt><dd>
        <span>{$messages.chunkParameterDeclaration}</span>
        <span>{$messages.insideChunk}</span><code>&lt;span&gt;[[+title]]&lt;/span&gt;</code>
        <span>{$messages.insideTemplate}</span><code>{parameterExample}</code>
      </dd></div>
      {/if}
      <div><dt>{$messages.pageValues}</dt><dd><code>[[*title]]</code>
        <code>[[*contentMd:markdown]]</code></dd></div>
      <div><dt>{$messages.buildLoader}</dt><dd><code>[[Snippet? &as=`data`]]</code>
        <span>{$messages.buildLoaderHint}</span></dd></div>
      <div><dt>{$messages.requestLoader}</dt><dd><code>[[!Snippet? &as=`data`]]</code>
        <span>{$messages.requestLoaderHint}</span></dd></div>
      <div><dt>{$messages.loaderResult}</dt><dd><code>[[+data.value]]</code>
        <span>{$messages.loaderResultHint}</span></dd></div>
    </dl>
    <p class="_syntax-note">{$messages.loaderRegistrationHint}</p>
  </details>
</section>
