<script lang="ts">
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import ResultsTabs from '$lib/components/ResultsTabs.svelte';
  import AlertCircle from 'lucide-svelte/icons/alert-circle';
  import Calendar from 'lucide-svelte/icons/calendar';
  import MapPin from 'lucide-svelte/icons/map-pin';
  import Clock from 'lucide-svelte/icons/clock';
  import { buildUnifiedTableExportModel, createCsvBlob, createPdfBlob, createJpgBlob } from '$lib/export';
  import { ATTEMPT_NUMBERS, type AttemptNumber, type LiftKind, type UnifiedRow } from '$lib/contest-table';
  import type { PageData } from './$types';

  export let data: PageData;

  let loading = false;
  let selectedTab: 'individual' | 'team' = 'individual';

  // Update selectedTab from data
  $: selectedTab = data.selectedTab as 'individual' | 'team';

  type ScoreboardExportDetail = {
    kind: 'scoreboard';
    format: 'csv' | 'json' | 'pdf' | 'jpg';
    rows: UnifiedRow[];
    lifts: LiftKind[];
    attemptNumbers?: AttemptNumber[];
    showPointsColumn?: boolean;
    showMaxColumn?: boolean;
    showRowNumbers?: boolean;
  };

  // Export functionality
  async function handleExport(event: CustomEvent) {
    const detail = event.detail;
    if (!detail) return;

    if (detail.kind === 'scoreboard') {
      await exportScoreboard(detail as ScoreboardExportDetail);
      return;
    }

    const exportData = detail.data;
    if (!exportData || exportData.length === 0) {
      console.warn('No data to export');
      return;
    }

    if (detail.view === 'team') {
      exportTeam(detail.format, exportData);
    }
  }

  async function exportScoreboard(detail: ScoreboardExportDetail) {
    const rows = detail.rows ?? [];
    if (rows.length === 0) {
      console.warn('No scoreboard data to export');
      return;
    }

    const referenceData = data.resultsBundle?.scoreboard?.referenceData ?? {
      weightClasses: [],
      ageCategories: [],
    };

    const lifts = detail.lifts?.length ? detail.lifts : ['Bench'];
    const translate = get(_);
    const statusLabels = {
      Pending: translate('attempt.status.pending'),
      Successful: translate('attempt.status.successful'),
      Failed: translate('attempt.status.failed'),
    } as const;
    const model = buildUnifiedTableExportModel({
      rows,
      lifts,
      attemptNumbers: detail.attemptNumbers ?? ATTEMPT_NUMBERS,
      showPointsColumn: detail.showPointsColumn ?? true,
      showMaxColumn: detail.showMaxColumn ?? true,
      weightClasses: referenceData.weightClasses ?? [],
      ageCategories: referenceData.ageCategories ?? [],
      translate,
      statusLabels,
      showRowNumbers: detail.showRowNumbers ?? false,
    });

    const contestName = data.contest?.name || 'results';
    const timestamp = new Date().toISOString().split('T')[0];
    const liftSuffix = lifts.length === 1 ? lifts[0]?.toLowerCase() : 'scoreboard';
    const base = `${contestName.replace(/[^a-zA-Z0-9]/g, '_')}_${liftSuffix}_${timestamp}`;

    if (detail.format === 'csv') {
      const blob = createCsvBlob(model);
      downloadFile(blob, `${base}.csv`);
    } else if (detail.format === 'json') {
      const json = JSON.stringify(rows, null, 2);
      downloadFile(json, `${base}.json`, 'application/json');
    } else if (detail.format === 'pdf') {
      const blob = await createPdfBlob(model, { title: contestName, subtitle: liftSuffix.toUpperCase() });
      downloadFile(blob, `${base}.pdf`, 'application/pdf');
    } else if (detail.format === 'jpg') {
      const blob = await createJpgBlob(model, { title: contestName, subtitle: liftSuffix.toUpperCase() });
      downloadFile(blob, `${base}.jpg`, 'image/jpeg');
    }
  }

  function exportTeam(format: 'csv' | 'json', teamData: any[]) {
    const contestName = data.contest?.name || 'results';
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${contestName.replace(/[^a-zA-Z0-9]/g, '_')}_team_${timestamp}`;

    if (format === 'csv') {
      const csv = generateTeamCSV(teamData);
      downloadFile(csv, `${filename}.csv`, 'text/csv');
    } else {
      const json = JSON.stringify(teamData, null, 2);
      downloadFile(json, `${filename}.json`, 'application/json');
    }
  }

  function generateTeamCSV(data: any[]): string {
    const headers = [
      'Rank',
      'Team',
      'Total Points',
      'Contributors',
      'First Name',
      'Last Name',
      'Gender',
      'Selected Lift',
      'Best Lift',
      'Points'
    ];

    const rows: string[][] = [];

    data.forEach((team) => {
      const teamRow = [
        team.rank,
        team.club,
        team.totalPoints,
        team.contributors.filter((c: any) => !c.isPlaceholder).length,
        '',
        '',
        '',
        '',
        '',
        ''
      ];
      rows.push(teamRow);

      team.contributors.forEach((contributor: any) => {
        if (!contributor.isPlaceholder) {
          const contributorRow = [
            '',
            '',
            '',
            '',
            contributor.firstName,
            contributor.lastName,
            contributor.gender,
            contributor.selectedLift || '',
            contributor.selectedLift === 'squat' ? contributor.bestSquat :
            contributor.selectedLift === 'bench' ? contributor.bestBench :
            contributor.selectedLift === 'deadlift' ? contributor.bestDeadlift : '',
            contributor.points
          ];
          rows.push(contributorRow);
        }
      });
    });

    return rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
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

  // Type-safe translation function with proper values object
  function t(key: string, values?: Record<string, string | number>) {
    const translate = $_(key);
    if (values && typeof translate === 'function') {
      return translate({ values });
    }
    return translate;
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
