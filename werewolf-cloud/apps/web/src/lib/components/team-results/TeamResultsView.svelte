<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { get } from 'svelte/store';
  import { locale } from 'svelte-i18n';
  import { ChevronDown, Download } from 'lucide-svelte';
  import TeamResultsTable from './TeamResultsTable.svelte';
  import { exportTeamResults } from '$lib/export';
  import { toast } from '$lib/ui/toast';
  import type { TeamResultsBundle } from '$lib/types';

  const descriptorDescriptionKey = 'contest_detail.team_results.metric_descriptions.mixed';

  export let teamResults: TeamResultsBundle | null = null;
  export let error: string | null = null;
  export let loading = false;
  export let contestName = '';
  $: activeTable = teamResults?.mixed ?? null;

  let exportMenuOpen = false;
  let exporting = false;

  function downloadFile(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleExport(format: 'csv' | 'pdf' | 'jpg') {
    if (!activeTable || exporting) return;
    
    exporting = true;
    exportMenuOpen = false;
    
    try {
      await exportTeamResults({
        table: activeTable,
        contestName,
        format,
        translate: get(_),
        locale: get(locale) ?? 'en',
        downloadFile,
        onSuccess: (message) => toast.success(message),
        onError: (message) => toast.error(message),
      });
    } finally {
      exporting = false;
    }
  }

  function closeExportMenu() {
    exportMenuOpen = false;
  }

  // Close menu when clicking outside
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.export-menu-container')) {
      closeExportMenu();
    }
  }

  function clickOutside(node: HTMLElement) {
    const handleClick = (event: MouseEvent) => handleClickOutside(event);
    
    document.addEventListener('click', handleClick, true);
    
    return {
      destroy() {
        document.removeEventListener('click', handleClick, true);
      }
    };
  }
</script>

<section class="space-y-6" on:click|stopPropagation>
  <header class="space-y-2">
    <p class="text-caption uppercase tracking-[0.35em] text-text-secondary">
      {$_('contest_detail.team_results.header_label')}
    </p>
    <h1 class="text-h2 text-text-primary">
      {$_('contest_detail.team_results.title')}
    </h1>
    <p class="text-body text-text-secondary">
      {contestName
        ? $_('contest_detail.team_results.subtitle_with_name', { contest: contestName })
        : $_('contest_detail.team_results.subtitle')}
    </p>
  </header>

  <div class="card space-y-6">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div class="space-y-2">
        <h2 class="text-h3 text-text-primary">
          {$_('contest_detail.team_results.leaderboard_title')}
        </h2>
        <p class="max-w-2xl text-body text-text-secondary">
          {$_(descriptorDescriptionKey)}
        </p>

      </div>

      {#if activeTable && activeTable.rows.length > 0}
        <div class="export-menu-container relative">
          <button
            type="button"
            class="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            on:click={() => exportMenuOpen = !exportMenuOpen}
            disabled={exporting}
            on:keydown={(e) => {
              if (e.key === 'Escape') closeExportMenu();
            }}
          >
            <Download class="h-4 w-4" />
            {$_('contest_detail.export.menu')}
            <ChevronDown class="h-4 w-4" />
          </button>

          {#if exportMenuOpen}
            <div
              class="absolute right-0 top-full z-50 mt-2 w-48 rounded-md border border-border-color bg-element-bg shadow-lg"
              on:click|stopPropagation
              use:clickOutside
            >
              <div class="py-1">
                <button
                  type="button"
                  class="flex w-full items-center gap-2 px-4 py-2 text-sm text-text-primary hover:bg-main-bg/50 focus:bg-main-bg/50 focus:outline-none"
                  on:click={() => handleExport('csv')}
                  disabled={exporting}
                >
                  {$_('contest_detail.export.csv')}
                </button>
                <button
                  type="button"
                  class="flex w-full items-center gap-2 px-4 py-2 text-sm text-text-primary hover:bg-main-bg/50 focus:bg-main-bg/50 focus:outline-none"
                  on:click={() => handleExport('pdf')}
                  disabled={exporting}
                >
                  {$_('contest_detail.export.pdf')}
                </button>
                <button
                  type="button"
                  class="flex w-full items-center gap-2 px-4 py-2 text-sm text-text-primary hover:bg-main-bg/50 focus:bg-main-bg/50 focus:outline-none"
                  on:click={() => handleExport('jpg')}
                  disabled={exporting}
                >
                  {$_('contest_detail.export.jpg')}
                </button>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    {#if error}
      <div class="rounded border border-status-error bg-status-error/20 px-4 py-3 text-sm text-status-error">
        {error}
      </div>
    {:else if loading}
      <p class="text-body text-text-secondary">{$_('contest_detail.team_results.loading')}</p>
    {:else if !activeTable || activeTable.rows.length === 0}
      <p class="text-body text-text-secondary">{$_('contest_detail.team_results.empty')}</p>
    {:else}
      <TeamResultsTable table={activeTable} />
    {/if}
  </div>
</section>
