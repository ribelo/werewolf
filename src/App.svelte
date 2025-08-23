<script lang="ts">
  import { onMount } from 'svelte';

  console.log('🔧 App.svelte script executing');

  onMount(() => {
    console.log('🏋️ App.svelte mounted');
    console.log('User Agent:', navigator.userAgent);
    console.log('Screen Resolution:', `${screen.width}x${screen.height}`);
    console.log('DOM app div:', document.getElementById('app'));
  });

  function handleSettingsClick(): void {
    console.log("⚙️ Settings clicked - not implemented yet");
  }

  function handleCompetitionWizardClick(): void {
    console.log("🏋️ Competition Wizard clicked - not implemented yet");
  }
</script>

<div class="min-h-screen bg-main-bg flex flex-col">
  <!-- Debug test -->
  <div style="color: red; font-size: 24px; padding: 20px;">
    DEBUG: If you see this, Svelte is working!
  </div>

  <!-- Header -->
  <header class="container-full py-8 border-b border-border-color">
    <h1 class="text-h1 text-center text-text-primary">
      WEREWOLF
    </h1>
    <p class="text-caption text-center text-text-secondary mt-2">
      Powerlifting Contest Management
    </p>
  </header>

  <!-- Main Content -->
  <main class="flex-1 container-medium py-16">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
      
      <!-- Settings Tile -->
      <div 
        class="card cursor-pointer no-select"
        on:click={handleSettingsClick}
        role="button"
        tabindex="0"
        on:keydown={(e) => e.key === 'Enter' && handleSettingsClick()}
      >
        <div class="text-center">
          <div class="text-6xl mb-6">⚙️</div>
          <h2 class="text-h2 text-text-primary mb-4">Settings</h2>
          <p class="text-body text-text-secondary">
            Configure application preferences and database settings
          </p>
        </div>
      </div>

      <!-- Competition Wizard Tile -->
      <div 
        class="card cursor-pointer no-select"
        on:click={handleCompetitionWizardClick}
        role="button"
        tabindex="0"
        on:keydown={(e) => e.key === 'Enter' && handleCompetitionWizardClick()}
      >
        <div class="text-center">
          <div class="text-6xl mb-6">🏋️</div>
          <h2 class="text-h2 text-text-primary mb-4">Competition Wizard</h2>
          <p class="text-body text-text-secondary">
            Create and manage powerlifting competitions
          </p>
        </div>
      </div>

    </div>
  </main>

  <!-- Footer -->
  <footer class="container-full py-4 border-t border-border-color">
    <p class="text-caption text-center text-text-secondary">
      Built for Andrzej's Powerlifting Club
    </p>
  </footer>
</div>