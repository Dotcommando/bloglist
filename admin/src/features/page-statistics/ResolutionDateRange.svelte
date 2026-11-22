<script lang="ts">
  import { type DateValue, parseDate } from '@internationalized/date';
  import { DateRangePicker, Portal } from 'bits-ui';

  import { messages } from '../../i18n/i18n';

  let { from, to, locale, disabled, onchange }: {
    from: string;
    to: string;
    locale: string;
    disabled: boolean;
    onchange: (from: string, to: string) => void;
  } = $props();
  let value: { start: DateValue | undefined; end: DateValue | undefined } = $derived({
    start: parseDate(from), end: parseDate(to),
  });
</script>

<DateRangePicker.Root bind:value {locale} {disabled} weekStartsOn={1} fixedWeeks
  onValueChange={(range) => {
    if (range.start && range.end) {
      onchange(range.start.toString(), range.end.toString());
    }
  }}>
  <DateRangePicker.Label class="resolution-range-label">{$messages.pageResolutionsDateRange}</DateRangePicker.Label>
  <div class="resolution-range-inputs">
    {#each ['start', 'end'] as const as type (type)}
      <DateRangePicker.Input {type} class="resolution-range-input">
        {#snippet children({ segments })}
          {#each segments as segment, index (index)}
            <DateRangePicker.Segment part={segment.part} class="resolution-date-segment">
              {segment.value}
            </DateRangePicker.Segment>
          {/each}
        {/snippet}
      </DateRangePicker.Input>
      {#if type === 'start'}<span aria-hidden="true">—</span>{/if}
    {/each}
    <DateRangePicker.Trigger class="cms-secondary resolution-calendar-trigger"
      aria-label={$messages.resolutionDateRangeOpenCalendar}>▦</DateRangePicker.Trigger>
  </div>
  <Portal>
    <DateRangePicker.Content class="resolution-calendar" sideOffset={8} collisionPadding={12}>
      <DateRangePicker.Calendar>
        {#snippet children({ months, weekdays })}
          <DateRangePicker.Header class="resolution-calendar-header">
            <DateRangePicker.PrevButton class="cms-secondary" aria-label={$messages.resolutionDateRangePreviousMonth}>
              ‹
            </DateRangePicker.PrevButton>
            <DateRangePicker.Heading />
            <DateRangePicker.NextButton class="cms-secondary" aria-label={$messages.resolutionDateRangeNextMonth}>
              ›
            </DateRangePicker.NextButton>
          </DateRangePicker.Header>
          {#each months as month (month.value.toString())}
            <DateRangePicker.Grid class="resolution-calendar-grid">
              <DateRangePicker.GridHead>
                <DateRangePicker.GridRow>
                  {#each weekdays as weekday, index (index)}
                    <DateRangePicker.HeadCell>{weekday}</DateRangePicker.HeadCell>
                  {/each}
                </DateRangePicker.GridRow>
              </DateRangePicker.GridHead>
              <DateRangePicker.GridBody>
                {#each month.weeks as week, index (index)}
                  <DateRangePicker.GridRow>
                    {#each week as date (date.toString())}
                      <DateRangePicker.Cell {date} month={month.value}>
                        <DateRangePicker.Day class="resolution-calendar-day">{date.day}</DateRangePicker.Day>
                      </DateRangePicker.Cell>
                    {/each}
                  </DateRangePicker.GridRow>
                {/each}
              </DateRangePicker.GridBody>
            </DateRangePicker.Grid>
          {/each}
        {/snippet}
      </DateRangePicker.Calendar>
    </DateRangePicker.Content>
  </Portal>
</DateRangePicker.Root>

<style>
  :global(.resolution-range-label) { display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600; }
  .resolution-range-inputs { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  :global(.resolution-range-input) { display: flex; align-items: center; min-height: 44px; }
  :global(.resolution-date-segment) { padding: 5px 2px; border-radius: 3px; font-variant-numeric: tabular-nums; }
  :global(.resolution-date-segment:focus-visible) { outline: 2px solid #31583e; outline-offset: 2px; }
  :global(.resolution-calendar-trigger) { min-width: 44px; }
  :global(.resolution-calendar) { z-index: 40; width: min(340px, calc(100vw - 24px)); padding: 12px;
    border: 1px solid #ced3cc; border-radius: 8px; background: #fff; box-shadow: 0 8px 24px #252d2726; }
  :global(.resolution-calendar-header) { display: flex; align-items: center; justify-content: space-between;
    gap: 8px; margin-bottom: 12px; font-size: 14px; }
  :global(.resolution-calendar-grid) { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 12px; }
  :global(.resolution-calendar-day) { width: 100%; min-height: 44px; padding: 0; border: 0; border-radius: 4px;
    background: transparent; color: #252d27; }
  :global(.resolution-calendar-day:hover) { background: #edf1e7; }
  :global(.resolution-calendar-day[data-highlighted]) { background: #e5ecdc; }
  :global(.resolution-calendar-day[data-selection-start]),
  :global(.resolution-calendar-day[data-selection-end]) { background: #244d37; color: #fff; }
  :global(.resolution-calendar-day[data-outside-month]) { color: #85917e; }
  :global(.resolution-calendar-day:focus-visible) { outline: 2px solid #31583e; outline-offset: -2px; }
</style>
