<script lang="ts">
  let { label, disabled = false, onclick, expanded, controls, id }: {
    label: string;
    disabled?: boolean;
    onclick: () => void;
    expanded?: boolean;
    controls?: string;
    id?: string;
  } = $props();
</script>

<button {id} type="button" class="cms-square" aria-label={label} aria-expanded={expanded} aria-controls={controls}
  {disabled} {onclick}>
  <svg class="_create-symbol" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
</button>
