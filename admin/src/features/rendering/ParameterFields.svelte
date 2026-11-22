<script lang="ts">
  import { messages } from '../../i18n/i18n';
  import ParameterFields from './ParameterFields.svelte';
  import { type IParameterField, ParameterKind } from './rendering.types';

  let { fields = $bindable([]), prefix, disabled = false, itemOnly = false }: {
    fields: IParameterField[];
    prefix: string;
    disabled?: boolean;
    itemOnly?: boolean;
  } = $props();

  function add(): void {
    fields = [...fields, { name: '', kind: ParameterKind.String, required: false }];
  }

  function changeKind(index: number, kind: ParameterKind): void {
    const field = fields[index]!;

    fields = fields.map((value, position) => position !== index ? value : {
      name: field.name,
      required: field.required,
      kind,
      ...(kind === ParameterKind.Object ? { properties: [] } : {}),
      ...(kind === ParameterKind.Array ? { items: { name: 'item', kind: ParameterKind.String, required: false } } : {}),
      ...(kind === ParameterKind.Enum ? { values: [] } : {}),
    });
  }

  function defaultText(field: IParameterField): string {
    if (field.defaultValue === undefined) {
      return '';
    }

    return field.kind === ParameterKind.String || field.kind === ParameterKind.Enum
      ? String(field.defaultValue) : JSON.stringify(field.defaultValue);
  }

  function setDefault(input: HTMLInputElement, index: number): void {
    const field = fields[index]!;

    input.setCustomValidity('');

    try {
      const defaultValue: unknown = field.kind === ParameterKind.String || field.kind === ParameterKind.Enum
        ? input.value : JSON.parse(input.value);

      fields = fields.map((value, position) => position !== index ? value : { ...field, defaultValue });
    } catch {
      input.setCustomValidity($messages.parameterDefaultInvalid);
    }
  }

  function initialDefault(kind: ParameterKind): unknown {
    return kind === ParameterKind.Boolean ? false : kind === ParameterKind.Number ? 0
      : kind === ParameterKind.Array ? [] : kind === ParameterKind.Object ? {} : '';
  }
</script>

<div class="parameter-fields">
  {#each fields as field, index (index)}
    {@const id = prefix + '-' + index}
    <fieldset class="_parameter-row" {disabled}>
      <legend>{$messages.parameter} {index + 1}</legend>
      <div class="_form-row">
        {#if !itemOnly}<div class="_form-field">
          <label for={id + '-name'}>{$messages.parameterName}</label>
          <input id={id + '-name'} bind:value={field.name} required pattern="[A-Za-z][A-Za-z0-9_]*"
            autocapitalize="none" spellcheck="false" />
        </div>{/if}
        <div class="_form-field">
          <label for={id + '-kind'}>{$messages.parameterType}</label>
          <select id={id + '-kind'} value={field.kind} onchange={(event) => {
            const kind = Object.values(ParameterKind).find((kind) => kind === event.currentTarget.value);

            if (kind) {
              changeKind(index, kind);
            }
          }}>
            {#each Object.values(ParameterKind) as kind (kind)}<option value={kind}>{kind}</option>{/each}
          </select>
        </div>
      </div>
      <div class="_parameter-options">
        <label><input type="checkbox" bind:checked={field.required} />{$messages.parameterRequired}</label>
        <label><input type="checkbox" checked={field.nullable === true} onchange={(event) => {
          field.nullable = event.currentTarget.checked;

          if (!field.nullable && field.defaultValue === null) {
            field.defaultValue = initialDefault(field.kind);
          }
        }} />{$messages.parameterNullable}</label>
        <label><input type="checkbox" checked={field.defaultValue !== undefined} onchange={(event) => {
          if (event.currentTarget.checked) {
            field.defaultValue = initialDefault(field.kind);
          } else {
            delete field.defaultValue;
          }
        }} />{$messages.parameterHasDefault}</label>
      </div>
      {#if field.defaultValue !== undefined}
        {#if field.nullable}
          <div class="_parameter-options"><label>
            <input type="checkbox" checked={field.defaultValue === null} onchange={(event) => {
              field.defaultValue = event.currentTarget.checked ? null : initialDefault(field.kind);
            }} />{$messages.parameterDefaultNull}
          </label></div>
        {/if}
        {#if field.defaultValue !== null}
        <div class="_form-field">
          <label for={id + '-default'}>{$messages.parameterDefault}</label>
          {#if field.kind === ParameterKind.Boolean}
            <select id={id + '-default'} value={String(field.defaultValue)} onchange={(event) => {
              field.defaultValue = event.currentTarget.value === 'true';
            }}><option value="false">false</option><option value="true">true</option></select>
          {:else}
            <input id={id + '-default'} type={field.kind === ParameterKind.Number ? 'number' : 'text'} step="any"
              value={defaultText(field)} oninput={(event) => {
                setDefault(event.currentTarget, index);
              }} />
          {/if}
        </div>
        {/if}
      {/if}
      {#if field.kind === ParameterKind.Enum}
        <div class="_form-field">
          <label for={id + '-values'}>{$messages.parameterEnumValues}</label>
          <textarea id={id + '-values'} rows="3" value={(field.values ?? []).join('\n')} oninput={(event) => {
            field.values = event.currentTarget.value.split('\n');
          }}></textarea>
        </div>
      {/if}
      {#if field.kind === ParameterKind.Object}
        <ParameterFields bind:fields={field.properties!} prefix={id + '-properties'} {disabled} />
      {:else if field.kind === ParameterKind.Array && field.items}
        <ParameterFields bind:fields={() => [field.items!], (value) => {
          field.items = value[0]!;
        }} prefix={id + '-items'} {disabled} itemOnly />
      {/if}
      {#if !itemOnly}<button type="button" class="cms-secondary" {disabled} onclick={() => {
        fields = fields.filter((_, position) => position !== index);
      }}>{$messages.removeParameter}</button>{/if}
    </fieldset>
  {/each}
  {#if !itemOnly}
    <button type="button" class="cms-secondary" {disabled} onclick={add}>{$messages.addParameter}</button>
  {/if}
</div>
