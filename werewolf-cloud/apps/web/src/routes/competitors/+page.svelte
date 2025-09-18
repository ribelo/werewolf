<script lang="ts">
  import Layout from '$lib/components/Layout.svelte';
  import CompetitorModal from '$lib/components/CompetitorModal.svelte';
  import { apiClient } from '$lib/api';
  import type { CompetitorSummary } from '$lib/types';
  import type { PageData } from './$types';
  import { _ } from 'svelte-i18n';

  export let data: PageData;

  const apiBase = data.apiBase;
  const loadError = data.error;

  let competitors: CompetitorSummary[] = [...data.competitors];
  let filteredCompetitors: CompetitorSummary[] = [...competitors];
  let searchTerm = '';
  let runtimeError: string | null = null;
  let reloading = false;

  let showModal = false;
  let modalMode: 'create' | 'edit' = 'create';
  let selectedCompetitor: CompetitorSummary | null = null;

  $: filterCompetitors();
  $: visibleCount = filteredCompetitors.length;

  function filterCompetitors() {
    if (!searchTerm) {
      filteredCompetitors = [...competitors];
      return;
    }
    const term = searchTerm.toLowerCase();
    filteredCompetitors = competitors.filter((c) => {
      const name = `${c.firstName} ${c.lastName}`.toLowerCase();
      const club = c.club?.toLowerCase() ?? '';
      const city = c.city?.toLowerCase() ?? '';
      return name.includes(term) || club.includes(term) || city.includes(term);
    });
  }

  function openCreateModal() {
    modalMode = 'create';
    selectedCompetitor = null;
    showModal = true;
  }

  function openEditModal(competitor: CompetitorSummary) {
    modalMode = 'edit';
    selectedCompetitor = competitor;
    showModal = true;
  }

  function closeModal() {
    showModal = false;
  }

  async function refreshCompetitors() {
    reloading = true;
    runtimeError = null;
    try {
      const response = await apiClient.get<CompetitorSummary[]>('/competitors');
      if (response.error) {
        runtimeError = response.error;
      }
      if (response.data) {
        competitors = response.data;
        filterCompetitors();
      }
    } catch (err) {
      runtimeError = err instanceof Error ? err.message : 'Failed to refresh competitors';
    } finally {
      reloading = false;
    }
  }

  async function handleModalSaved() {
    await refreshCompetitors();
  }
</script>

<svelte:head>
  <title>{$_('competitors_page.title')}</title>
</svelte:head>

<Layout
  title={$_('competitors_page.title')}
  subtitle={$_('competitors_page.subtitle')}
  currentPage="competitors"
  apiBase={apiBase}
>
  <div class="space-y-6">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div>
        <h2 class="text-h2 text-text-primary uppercase tracking-[0.3em]">{$_('competitors_page.title')}</h2>
        <p class="text-body text-text-secondary">{$_('competitors_page.subtitle')}</p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-caption text-text-secondary uppercase tracking-[0.4em]">
          {$_('competitors_page.visible', { values: { visible: visibleCount, total: competitors.length } })}
        </span>
        <button type="button" class="btn-primary px-4 py-2" on:click={openCreateModal}>
          {$_('competitors_page.add')}
        </button>
      </div>
    </div>

    {#if loadError}
      <div class="card border-status-error">
        <h3 class="text-h3 text-status-error mb-2">{$_('competitors_page.error_title')}</h3>
        <p class="text-body text-text-secondary">{loadError}</p>
      </div>
    {/if}

    {#if runtimeError}
      <div class="card border-status-warning">
        <h3 class="text-h3 text-status-warning mb-2">{$_('competitors_page.refresh_warning')}</h3>
        <p class="text-body text-text-secondary">{runtimeError}</p>
      </div>
    {/if}

    <div class="flex flex-col gap-4">
      <div class="flex flex-col sm:flex-row sm:items-center gap-3">
        <div class="relative flex-1 max-w-md">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" viewBox="0 0 24 24">
            <path
              d="M15 15l5 5m-8-3a6 6 0 100-12 6 6 0 000 12z"
              stroke="currentColor"
              stroke-width="2"
              fill="none"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <input
            type="text"
            bind:value={searchTerm}
            placeholder={$_('competitors_page.search_placeholder')}
            class="input-field pl-10 w-full"
          />
        </div>
        {#if reloading}
          <span class="text-caption text-text-secondary uppercase tracking-[0.4em]">Refreshing…</span>
        {/if}
      </div>

      {#if competitors.length === 0}
        <div class="card">
          <p class="text-body text-text-secondary">{$_('competitors_page.empty')}</p>
        </div>
      {:else if filteredCompetitors.length === 0}
        <div class="card">
          <p class="text-body text-text-secondary">{$_('competitors_page.no_match', { values: { term: searchTerm } })}</p>
        </div>
      {:else}
        <div class="overflow-x-auto">
          <table class="min-w-full text-left text-sm text-text-secondary">
            <thead class="bg-element-bg text-label">
              <tr>
                <th class="px-4 py-3">{$_('competitors_page.table.name')}</th>
                <th class="px-4 py-3">{$_('competitors_page.table.birth')}</th>
                <th class="px-4 py-3">{$_('competitors_page.table.club')}</th>
                <th class="px-4 py-3">{$_('competitors_page.table.city')}</th>
                <th class="px-4 py-3">{$_('competitors_page.table.order')}</th>
                <th class="px-4 py-3 text-right">{$_('competitors_page.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredCompetitors as competitor, index}
                <tr class={`border-b border-border-color ${index % 2 === 0 ? 'bg-main-bg' : 'bg-card-bg'}`}>
                  <td class="px-4 py-3">
                    <p class="text-text-primary font-semibold">{competitor.firstName} {competitor.lastName}</p>
                    <p class="text-caption text-text-secondary mt-1">{competitor.gender}</p>
                  </td>
                  <td class="px-4 py-3">{new Date(competitor.birthDate).toLocaleDateString()}</td>
                  <td class="px-4 py-3">{competitor.club ?? '—'}</td>
                  <td class="px-4 py-3">{competitor.city ?? '—'}</td>
                  <td class="px-4 py-3">{competitor.competitionOrder ?? '—'}</td>
                  <td class="px-4 py-3 text-right">
                    <button type="button" class="btn-secondary px-3 py-1 text-xxs" on:click={() => openEditModal(competitor)}>
                      Edit
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  </div>

  {#if showModal}
    <CompetitorModal
      competitor={selectedCompetitor}
      mode={modalMode}
      onClose={closeModal}
      onSaved={handleModalSaved}
    />
  {/if}
</Layout>
