<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { _ } from 'svelte-i18n';
  import { Calculator, FileDown, FileText } from 'lucide-svelte';

  // Backend Models
  interface CompetitionResult {
    id: string;
    registrationId: string;
    contestId: string;
    bestBench?: number;
    bestSquat?: number;
    bestDeadlift?: number;
    totalWeight: number;
    coefficientPoints: number;
    placeOpen?: number;
    placeInAgeClass?: number;
    placeInWeightClass?: number;
    isDisqualified: boolean;
    disqualificationReason?: string;
    brokeRecord: boolean;
    recordType?: string;
    calculatedAt: string;
  }

  interface ScoreboardData {
    rankings: CompetitionResult[];
    totalCompetitors: number;
    contestName?: string;
    updatedAt: string;
  }

  enum RankingType {
    Open = 'Open',
    Age = 'Age', 
    Weight = 'Weight'
  }

  // Props
  export let contestId: string = '';

  // State
  let results: CompetitionResult[] = [];
  let scoreboardData: ScoreboardData | null = null;
  let currentRankingType: RankingType = RankingType.Open;
  let loading = false;
  let error = '';

  // Load results data
  async function loadResults() {
    if (!contestId) return;
    
    loading = true;
    error = '';
    
    try {
      results = await invoke('result_get_rankings', {
        contestId,
        rankingType: currentRankingType
      });
    } catch (e) {
      error = `Failed to load results: ${e}`;
      console.error('Failed to load results:', e);
    } finally {
      loading = false;
    }
  }

  // Load scoreboard data
  async function loadScoreboard() {
    if (!contestId) return;
    
    try {
      scoreboardData = await invoke('result_get_scoreboard', { contestId });
    } catch (e) {
      console.error('Failed to load scoreboard:', e);
    }
  }

  // Calculate results for contest
  async function calculateResults() {
    if (!contestId) return;
    
    loading = true;
    error = '';
    
    try {
      await invoke('result_calculate', { contestId });
      await loadResults();
      await loadScoreboard();
    } catch (e) {
      error = `Failed to calculate results: ${e}`;
      console.error('Failed to calculate results:', e);
    } finally {
      loading = false;
    }
  }

  // Export results
  async function exportResults(format: string) {
    if (!contestId) return;
    
    try {
      const exportData = await invoke('result_export', { contestId, format });
      
      // Create download link
      const blob = new Blob([exportData as string], { 
        type: format === 'csv' ? 'text/csv' : 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contest-results.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      error = `Failed to export results: ${e}`;
      console.error('Failed to export results:', e);
    }
  }

  // Change ranking type
  async function changeRankingType(type: RankingType) {
    currentRankingType = type;
    await loadResults();
  }

  // Load data on mount and when contestId changes
  onMount(loadResults);
  $: if (contestId) {
    loadResults();
    loadScoreboard();
  }
</script>

<div class="results-view">
  <div class="results-header">
    <h2>Contest Results</h2>
    {#if scoreboardData?.contestName}
      <h3>{scoreboardData.contestName}</h3>
    {/if}
    <div class="results-actions">
      <button on:click={calculateResults} disabled={loading || !contestId}>
        <Calculator size={16} strokeWidth={2} class="inline mr-2" />
        {$_('results.calculate_results')}
      </button>
      <button on:click={() => exportResults('csv')} disabled={loading || !contestId}>
        <FileDown size={16} strokeWidth={2} class="inline mr-2" />
        {$_('results.export_csv')}
      </button>
      <button on:click={() => exportResults('json')} disabled={loading || !contestId}>
        Export JSON
      </button>
    </div>
  </div>

  <div class="ranking-tabs">
    <button 
      class:active={currentRankingType === RankingType.Open}
      on:click={() => changeRankingType(RankingType.Open)}
    >
      Open ({scoreboardData?.totalCompetitors || 0})
    </button>
    <button 
      class:active={currentRankingType === RankingType.Age}
      on:click={() => changeRankingType(RankingType.Age)}
    >
      Age Classes
    </button>
    <button 
      class:active={currentRankingType === RankingType.Weight}
      on:click={() => changeRankingType(RankingType.Weight)}
    >
      Weight Classes
    </button>
  </div>

  {#if loading}
    <div class="loading">{$_('results.loading')}</div>
  {/if}

  {#if error}
    <div class="error">{error}</div>
  {/if}

  {#if results.length > 0 && !loading}
    <div class="results-table">
      <table>
        <thead>
          <tr>
            <th>Place</th>
            <th>Registration</th>
            <th>Squat</th>
            <th>Bench</th>
            <th>Deadlift</th>
            <th>Total</th>
            <th>Points</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {#each results as result}
            <tr class:disqualified={result.isDisqualified}>
              <td>
                {#if currentRankingType === RankingType.Open}
                  {result.placeOpen || '-'}
                {:else if currentRankingType === RankingType.Age}
                  {result.placeInAgeClass || '-'}
                {:else}
                  {result.placeInWeightClass || '-'}
                {/if}
              </td>
              <td>{result.registrationId}</td>
              <td>{result.bestSquat ? result.bestSquat.toFixed(1) : '-'}</td>
              <td>{result.bestBench ? result.bestBench.toFixed(1) : '-'}</td>
              <td>{result.bestDeadlift ? result.bestDeadlift.toFixed(1) : '-'}</td>
              <td class="total">{result.totalWeight.toFixed(1)}</td>
              <td>{result.coefficientPoints.toFixed(2)}</td>
              <td>
                {#if result.isDisqualified}
                  <span class="status disqualified">DQ</span>
                {:else if result.brokeRecord}
                  <span class="status record">RECORD</span>
                {:else}
                  <span class="status qualified">✓</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if !loading && contestId}
    <div class="no-results">
      <p>{$_('results.no_results_available')}</p>
    </div>
  {:else if !contestId}
    <div class="no-contest">
      <p>{$_('results.select_contest_to_view')}</p>
    </div>
  {/if}
</div>

<style>
  .results-view {
    padding: 1rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  .results-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .results-header h2 {
    margin: 0;
    color: #333;
  }

  .results-header h3 {
    margin: 0;
    color: #666;
    font-weight: normal;
  }

  .results-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .ranking-tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    border-bottom: 2px solid #eee;
  }

  .ranking-tabs button {
    padding: 0.5rem 1rem;
    border: none;
    background: transparent;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.2s ease;
  }

  .ranking-tabs button.active {
    border-bottom-color: #007bff;
    color: #007bff;
    font-weight: bold;
  }

  .ranking-tabs button:hover {
    background-color: #f8f9fa;
  }

  .loading, .error, .no-results, .no-contest {
    text-align: center;
    padding: 2rem;
    color: #666;
  }

  .error {
    color: #dc3545;
    background-color: #f8d7da;
    border: 1px solid #f5c6cb;
    border-radius: 4px;
  }

  .results-table {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  }

  th, td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid #eee;
  }

  th {
    background-color: #f8f9fa;
    font-weight: bold;
    color: #495057;
  }

  td.total {
    font-weight: bold;
    color: #007bff;
  }

  .status {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: bold;
  }

  .status.qualified {
    background-color: #d4edda;
    color: #155724;
  }

  .status.record {
    background-color: #fff3cd;
    color: #856404;
  }

  .status.disqualified {
    background-color: #f8d7da;
    color: #721c24;
  }

  tr.disqualified {
    opacity: 0.6;
  }

  button {
    padding: 0.5rem 1rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: white;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  button:hover:not(:disabled) {
    background-color: #f8f9fa;
    border-color: #007bff;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    .results-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .ranking-tabs {
      flex-wrap: wrap;
    }
    
    table {
      font-size: 0.875rem;
    }
    
    th, td {
      padding: 0.5rem 0.25rem;
    }
  }
</style>