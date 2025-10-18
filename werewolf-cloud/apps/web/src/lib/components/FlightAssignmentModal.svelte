<script lang="ts">
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import type { Registration } from '$lib/types';

  export let registrations: Registration[] = [];
  export let onClose: (result?: unknown) => void = () => {};
  export let onSaved: (result?: unknown) => void = () => {};

  const DEFAULT_FLIGHT_CODE = 'A';
  const FLIGHT_CODES = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)); // A-Z

  let autoFlightSize = 10;
  let flightDrafts: Record<string, { flightCode: string; flightOrder: number | null }> = {};

  type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;

  function t(key: string, values?: MessageValues): string {
    const translate = get(_);
    return translate(key, values ? { values } : undefined);
  }

  function initializeFlightDrafts() {
    flightDrafts = {};
    for (const reg of registrations) {
      flightDrafts[reg.id] = {
        flightCode: reg.flightCode ?? DEFAULT_FLIGHT_CODE,
        flightOrder: reg.flightOrder ?? null,
      };
    }
  }

  function updateFlightDraft(registrationId: string, updates: { flightCode?: string; flightOrder?: number | null }) {
    const current = flightDrafts[registrationId] ?? { flightCode: DEFAULT_FLIGHT_CODE, flightOrder: null };
    flightDrafts[registrationId] = { ...current, ...updates };
  }

  function autoAssignFlights() {
    const sortedRegistrations = [...registrations].sort((a, b) => {
      // Sort by flight code first, then by flight order
      const aFlight = a.flightCode ?? DEFAULT_FLIGHT_CODE;
      const bFlight = b.flightCode ?? DEFAULT_FLIGHT_CODE;
      if (aFlight !== bFlight) {
        return aFlight.localeCompare(bFlight);
      }
      return (a.flightOrder ?? 0) - (b.flightOrder ?? 0);
    });

    let currentFlight = DEFAULT_FLIGHT_CODE;
    let currentOrder = 1;
    let currentFlightSize = 0;

    for (const reg of sortedRegistrations) {
      if (currentFlightSize >= autoFlightSize) {
        currentFlight = String.fromCharCode(currentFlight.charCodeAt(0) + 1);
        currentOrder = 1;
        currentFlightSize = 0;
      }

      updateFlightDraft(reg.id, {
        flightCode: currentFlight,
        flightOrder: currentOrder,
      });

      currentOrder++;
      currentFlightSize++;
    }
  }

  function resetAllFlights() {
    for (const reg of registrations) {
      updateFlightDraft(reg.id, {
        flightCode: DEFAULT_FLIGHT_CODE,
        flightOrder: null,
      });
    }
  }

  function handleSave() {
    // Convert drafts back to registration updates
    const updates = registrations.map(reg => ({
      id: reg.id,
      flightCode: flightDrafts[reg.id]?.flightCode ?? DEFAULT_FLIGHT_CODE,
      flightOrder: flightDrafts[reg.id]?.flightOrder,
    }));

    onSaved(updates);
    onClose();
  }

  // Initialize drafts when component mounts
  $: if (registrations.length > 0) {
    initializeFlightDrafts();
  }
</script>

<div class="space-y-4">
  <!-- Flight assignment controls -->
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-2">
      <label class="text-xxs uppercase tracking-[0.2em] text-text-secondary" for="auto-flight-size">
        {t('contest_detail.registrations.auto_assign_size_label')}
      </label>
      <input
        class="input w-24 text-sm"
        type="number"
        min="1"
        id="auto-flight-size"
        bind:value={autoFlightSize}
      />
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="btn-secondary px-3 py-2 text-xxs"
        on:click={autoAssignFlights}
      >
        {t('contest_detail.registrations.auto_assign_action')}
      </button>
      <button
        type="button"
        class="btn-ghost px-3 py-2 text-xxs"
        on:click={resetAllFlights}
      >
        {t('contest_detail.registrations.reset_flights')}
      </button>
    </div>
  </div>

  <!-- Registrations table -->
  <div class="max-h-[60vh] overflow-auto">
    <table class="w-full border-collapse text-sm">
      <thead class="bg-element-bg text-label">
        <tr>
          <th class="px-3 py-2 text-left">{t('contest_detail.registrations.columns.lifter')}</th>
          <th class="px-3 py-2 text-left">{t('contest_detail.registrations.columns.flight')}</th>
          <th class="px-3 py-2 text-left">{t('contest_detail.registrations.columns.flight_order')}</th>
        </tr>
      </thead>
      <tbody>
        {#each registrations as reg (reg.id)}
          {@const draft = flightDrafts[reg.id] ?? { flightCode: DEFAULT_FLIGHT_CODE, flightOrder: null }}
          <tr class="border-b border-border-color">
            <td class="px-3 py-2">
              <div class="flex flex-col">
                <span class="font-semibold text-text-primary">{reg.firstName} {reg.lastName}</span>
                <span class="text-caption text-text-secondary">{reg.club ?? '—'}</span>
              </div>
            </td>
            <td class="px-3 py-2">
              <select
                class="input w-full text-sm"
                value={draft.flightCode}
                on:change={(event) => {
                  const target = event.currentTarget;
                  if (!(target instanceof HTMLSelectElement)) {
                    return;
                  }
                  updateFlightDraft(reg.id, { flightCode: target.value });
                }}
              >
                {#each FLIGHT_CODES as code}
                  <option value={code}>{code}</option>
                {/each}
              </select>
            </td>
            <td class="px-3 py-2">
              <input
                class="input w-24 text-sm"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                value={draft.flightOrder ?? ''}
                on:input={(event) => {
                  const target = event.currentTarget;
                  if (!(target instanceof HTMLInputElement)) {
                    return;
                  }
                  const raw = target.value.trim();
                  const numeric = raw === '' ? null : Number(raw);
                  updateFlightDraft(reg.id, {
                    flightOrder: Number.isFinite(numeric) ? numeric : null
                  });
                }}
                placeholder="—"
              />
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

