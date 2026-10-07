<script lang="ts">
  import { goto } from '$app/navigation';
  import { apiClient, ApiError } from '$lib/api';
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';

  let password = '';
  let error: string | null = null;
  let loading = false;

  onMount(() => {
    password = '';
    error = null;
  });

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    error = null;

    if (!password) {
      error = $_('login.error.password_required');
      return;
    }

    loading = true;

    try {
      const response = await apiClient.post<{ authenticated: boolean }>('/auth/login', { password });

      if (response.data?.authenticated) {
        await goto('/');
        return;
      }

      error = response.error ?? $_('login.error.failed');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        error = $_('login.error.invalid_password');
      } else if (err instanceof Error) {
        error = err.message;
      } else {
        error = $_('login.error.generic');
      }
    } finally {
      loading = false;
    }
  };
</script>

<svelte:head>
  <title>{$_('login.page_title')}</title>
</svelte:head>

<main class="min-h-screen py-16 flex items-center justify-center">
  <div class="container-narrow">
    <div class="card max-w-lg mx-auto">
      <header class="card-header flex flex-col gap-2">
        <span class="text-label text-text-secondary uppercase tracking-[0.4em]">{$_('login.eyebrow')}</span>
        <h1 class="text-display text-text-primary">{$_('login.title')}</h1>
        <p class="text-body text-text-secondary max-w-md">
          {$_('login.subtitle')}
        </p>
      </header>

      <form class="space-y-6" on:submit={handleSubmit}>
        <label class="block space-y-2">
          <span class="input-label">{$_('login.password_label')}</span>
          <input
            type="password"
            class="input-field w-full"
            bind:value={password}
            placeholder={$_('login.password_placeholder')}
            required
            autocomplete="current-password"
          />
        </label>

        {#if error}
          <p class="text-caption text-status-error" role="status">{error}</p>
        {/if}

        <button
          class="btn-primary w-full text-center justify-center"
          type="submit"
          disabled={loading}
        >
          {#if loading}
            {$_('login.submitting')}
          {:else}
            {$_('login.submit')}
          {/if}
        </button>
      </form>
    </div>
  </div>
</main>