<script lang="ts">
  import { goto } from '$app/navigation';
  import { apiClient, ApiError } from '$lib/api';
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
      error = 'Enter the admin password';
      return;
    }

    loading = true;

    try {
      const response = await apiClient.post<{ authenticated: boolean }>('/auth/login', { password });

      if (response.data?.authenticated) {
        await goto('/');
        return;
      }

      error = response.error ?? 'Login failed';
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        error = 'Invalid password';
      } else if (err instanceof Error) {
        error = err.message;
      } else {
        error = 'Unable to login';
      }
    } finally {
      loading = false;
    }
  };
</script>

<svelte:head>
  <title>Login | Werewolf Cloud</title>
</svelte:head>

<main class="min-h-screen py-16 flex items-center justify-center">
  <div class="container-narrow">
    <div class="card max-w-lg mx-auto">
      <header class="card-header flex flex-col gap-2">
        <span class="text-label text-text-secondary uppercase tracking-[0.4em]">Organizer Access</span>
        <h1 class="text-display text-text-primary">Werewolf Cloud</h1>
        <p class="text-body text-text-secondary max-w-md">
          Sign in with the organizer password to unlock contest management, results entry, and settings.
        </p>
      </header>

      <form class="space-y-6" on:submit={handleSubmit}>
        <label class="block space-y-2">
          <span class="input-label">Admin password</span>
          <input
            type="password"
            class="input-field w-full"
            bind:value={password}
            placeholder="Enter organizer password"
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
            Signing in…
          {:else}
            Enter Control Room
          {/if}
        </button>
      </form>
    </div>
  </div>
</main>
