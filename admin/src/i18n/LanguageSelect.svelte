<script lang="ts">
  import { adminLanguage, adminLocales, messages, setAdminLanguage } from './i18n';
</script>

<label class="admin-language">
  <span class="_language-label">{$messages.interfaceLanguage}</span>
  <select class="cms-select-compact" value={$adminLanguage} onchange={(event) => {
    setAdminLanguage(event.currentTarget.value);
  }}>
    {#each Object.entries(adminLocales) as [code, locale] (code)}
      <option value={code} lang={code}>{locale.name}</option>
    {/each}
  </select>
</label>
