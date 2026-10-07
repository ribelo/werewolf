<script lang="ts">
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import ResultsTabs from '$lib/components/ResultsTabs.svelte';
  import AlertCircle from 'lucide-svelte/icons/alert-circle';
  import Calendar from 'lucide-svelte/icons/calendar';
  import MapPin from 'lucide-svelte/icons/map-pin';
  import Clock from 'lucide-svelte/icons/clock';
  import {
    buildTeamResultsExportModel,
    buildUnifiedTableExportModel,
    createCsvBlob,
    createJpgBlob,
    createPdfBlob,
  } from '$lib/export';
  import { ATTEMPT_NUMBERS, type LiftKind } from '$lib/contest-table';
  import type {
    ResultsExportDetail,
    ResultsTab,
    ScoreboardExportDetail,
    TeamExportDetail,
  } from '$lib/components/public-results';
  import type { PageData } from './$types';

  export let data: PageData;

  const loading = false;
  const DEFAULT_LIFTS: LiftKind[] = ['Bench'];
  const FALLBACK_REFERENCE_DATA = { weightClasses: [], ageCategories: [] };

  let selectedTab: ResultsTab = 'individual';

  // The loader validates the ?tab= query parameter, so the page only narrows it.
  $: selectedTab = data.selectedTab === 'team' ? 'team' : 'individual';

  /** Export requests bubbled up by the results tabs. */
  async function handleExport(event: CustomEvent<ResultsExportDetail>) {
    const detail = event.detail;
    if (detail.kind === 'scoreboard') {
      await exportScoreboard(detail);
      return;
    }
    exportTeam(detail);
  }

  async function exportScoreboard(detail: ScoreboardExportDetail) {
    const rows = detail.rows;
    if (rows.length === 0) {
      console.warn('No scoreboard data to export');
      return;
    }

    const referenceData = data.resultsBundle?.scoreboard?.referenceData ?? FALLBACK_REFERENCE_DATA;
    const lifts = detail.lifts.length > 0 ? detail.lifts : DEFAULT_LIFTS;
    const translate = get(_);
    const statusLabels = {
      Pending: translate('attempt.status.pending'),
      Successful: translate('attempt.status.successful'),
      Failed: translate('attempt.status.failed'),
    };
    const model = buildUnifiedTableExportModel({
      rows,
      lifts,
      attemptNumbers: detail.attemptNumbers.length > 0 ? detail.attemptNumbers : ATTEMPT_NUMBERS,
      showPointsColumn: detail.showPointsColumn,
      showMaxColumn: detail.showMaxColumn,
      weightClasses: referenceData.weightClasses ?? [],
      ageCategories: referenceData.ageCategories ?? [],
      translate,
      statusLabels,
      showRowNumbers: detail.showRowNumbers,
    });

    const contestName = data.contest?.name || 'results';
    const timestamp = new Date().toISOString().slice(0, 10);
    const primaryLift: LiftKind = lifts[0] ?? 'Bench';
    const liftSuffix = lifts.length === 1 ? primaryLift.toLowerCase() : 'scoreboard';
    const base = `${contestName.replace(/[^a-zA-Z0-9]/g, '_')}_${liftSuffix}_${timestamp}`;

    if (detail.format === 'csv') {
      downloadFile(createCsvBlob(model), `${base}.csv`);
    } else if (detail.format === 'json') {
      downloadFile(JSON.stringify(rows, null, 2), `${base}.json`, 'application/json');
    } else if (detail.format === 'pdf') {
      const blob = await createPdfBlob(model, { title: contestName, subtitle: liftSuffix.toUpperCase() });
      downloadFile(blob, `${base}.pdf`, 'application/pdf');
    } else if (detail.format === 'jpg') {
      const blob = await createJpgBlob(model, { title: contestName, subtitle: liftSuffix.toUpperCase() });
      downloadFile(blob, `${base}.jpg`, 'image/jpeg');
    }
  }

  function exportTeam(detail: TeamExportDetail) {
    const contestName = data.contest?.name || 'results';
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `${contestName.replace(/[^a-zA-Z0-9]/g, '_')}_team_${timestamp}`;

    if (detail.format === 'csv') {
      // The same mapping and CSV serialiser the organizer export uses, so the
      // public download carries the same columns and escaping.
      const model = buildTeamResultsExportModel({ table: detail.table, translate: get(_) });
      downloadFile(createCsvBlob(model), `${filename}.csv`);
    } else {
      downloadFile(JSON.stringify(detail.table.rows, null, 2), `${filename}.json`, 'application/json');
    }
  }

  function downloadFile(content: string | Blob, filename: string, mimeType = 'application/octet-stream') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function formatDate(dateStr: string): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
</script>

<svelte:head>
  <title>{data.contest ? `${data.contest.name} - Results` : 'Contest Results'}</title>
  <meta name="description" content="Official contest results" />
  <meta property="og:title" content={data.contest ? `${data.contest.name} - Results` : 'Contest Results'} />
  <meta property="og:description" content="Official contest results" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content={data.contest ? `${data.contest.name} - Results` : 'Contest Results'} />
  <meta name="twitter:description" content="Official contest results" />
</svelte:head>

<div class="min-h-screen bg-main-bg">
  <div class="container mx-auto px-4 py-8">
    <!-- Header -->
    <header class="mb-8">
      {#if data.error}
        <div class="rounded-lg border border-status-error bg-status-error/20 p-6 text-center">
          <AlertCircle class="h-12 w-12 text-status-error mx-auto mb-4" />
          <h1 class="text-h1 text-text-primary mb-2">{$_('public.results.error.title')}</h1>
          <p class="text-body text-text-secondary mb-4">{data.error}</p>
          <a href="/" class="text-primary hover:underline">{$_('public.results.error.back_home')}</a>
        </div>
      {:else if data.contest}
        <div class="space-y-4">
          <div>
            <h1 class="text-h1 text-text-primary mb-2">{data.contest.name}</h1>
            <p class="text-h4 text-text-secondary">{$_('public.results.subtitle')}</p>
          </div>

          <!-- Contest Info -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-text-secondary">
            {#if data.contest.date}
              <div class="flex items-center gap-2">
                <Calendar class="h-4 w-4" />
                <span>{formatDate(data.contest.date)}</span>
              </div>
            {/if}
            {#if data.contest.location}
              <div class="flex items-center gap-2">
                <MapPin class="h-4 w-4" />
                <span>{data.contest.location}</span>
              </div>
            {/if}
            {#if data.lastUpdated}
              <div class="flex items-center gap-2">
                <Clock class="h-4 w-4" />
                <span>Last updated: {formatDate(data.lastUpdated)}</span>
              </div>
            {/if}
          </div>
        </div>
      {:else}
        <div class="text-center">
          <h1 class="text-h1 text-text-primary mb-4">{$_('public.results.page_title')}</h1>
          <p class="text-body text-text-secondary">{$_('public.results.loading')}</p>
        </div>
      {/if}
    </header>

    <!-- Results Content -->
    <main>
      {#if data.resultsBundle}
        <ResultsTabs
          contest={data.contest}
          resultsBundle={data.resultsBundle}
          loading={loading}
          {selectedTab}
          on:export={handleExport}
        />
      {:else if !data.error && data.contest}
        <div class="text-center py-12">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p class="text-text-secondary">{$_('public.results.loading')}</p>
        </div>
      {/if}
    </main>

    <!-- Footer -->
    {#if data.contest}
      <footer class="mt-16 pt-8 border-t border-border-color text-center text-sm text-text-secondary">
        <p>Results generated for contest: {data.contest.name}</p>
      </footer>
    {/if}
  </div>
</div>
