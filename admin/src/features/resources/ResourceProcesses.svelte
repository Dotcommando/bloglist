<script lang="ts">
  import { messages } from '../../i18n/i18n';
  import { resourceProcessSummary } from './resource-process-summary.js';
  import type { IResourceView } from './resources-api.js';

  let { value }: { value: IResourceView } = $props();
  const summary = $derived(resourceProcessSummary(value.processes ?? []));
  function siteLabel(siteId: string): string {
    const site = value.sites.find(site => site.siteId === siteId);

    return site ? `${site.name} (${site.domain})` : siteId;
  }
  const role = (name: string): string => ({
    Coordinator: $messages.resourceProcessesCoordinator,
    Administration: $messages.resourceProcessesAdministrationAndBackgroundWork,
    Site: $messages.adminUsersSite,
    Dump: $messages.resourceProcessesDumpCapture,
  })[name] ?? name;
  const state = (name: string): string => ({
    Starting: $messages.resourceProcessesStarting,
    Ready: $messages.resourceProcessesReady,
    Draining: $messages.resourceProcessesDraining,
  })[name] ?? name;
</script>

{#if value.processes}
  <p><strong>{$messages.resourceProcessesTotalCMSProcesses} {summary.total}</strong>
    = {$messages.resourceProcessesSites} {summary.sites} + {$messages.resourceProcessesServices} {summary.services}
    {#if summary.dumps}
      + {$messages.resourceProcessesDumps} {summary.dumps}{/if}.</p>
  {#if summary.pending}
    <p>{$messages.resourceProcessesAwaitingAPID} {summary.pending}</p>
  {/if}
  <div class="cms-table-wrap">
    <!-- svelte-ignore a11y_no_redundant_roles (Mobile grid display needs explicit table semantics.) -->
    <table class="cms-table cms-table__responsive" role="table" aria-label={$messages.resourceProcessesCMSProcesses}>
      <thead role="rowgroup"><tr role="row">
        <th scope="col" role="columnheader">{$messages.resourceProcessesRole}</th>
        <th scope="col" role="columnheader">PID</th>
        <th scope="col" role="columnheader">{$messages.resourceProcessesState}</th>
      </tr></thead>
      <tbody role="rowgroup">
        {#each value.processes as process, index (`${process.pid}:${index}`)}
          <tr role="row"><td role="cell" class="cms-table-primary">{role(process.role)}
            {#if process.siteId}
              · {siteLabel(process.siteId)}
            {/if}
          </td>
            <td role="cell" data-label="PID"><span class="_process-value">{process.pid ?? '—'}</span></td>
            <td role="cell" class="cms-table-meta__wide" data-label={$messages.resourceProcessesState}>
              <span class="_process-value">{state(process.state)}</span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if value.processes.some(process => process.state !== 'Ready')}
    <p>{$messages.resourceProcessesStartingAndDrainingProcessesAre}</p>
  {/if}
{:else}
  <p>{$messages.resourceProcessesProcessInventoryUnavailable}</p>
{/if}

<style>
  ._process-value { white-space: nowrap; }
</style>
