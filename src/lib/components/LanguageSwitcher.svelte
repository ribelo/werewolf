<script lang="ts">
  import { locale, _ } from 'svelte-i18n';
  import { availableLocales } from '../i18n/index';
  import { Globe } from 'lucide-svelte';

  let currentLocale: string = 'pl';
  
  // Subscribe to locale changes
  locale.subscribe((value) => {
    if (value) {
      currentLocale = value;
      // Save to localStorage for persistence
      localStorage.setItem('werewolf-language', value);
    }
  });

  function switchLanguage(newLocale: string) {
    locale.set(newLocale);
  }

  // Get the flag emoji for each locale
  function getFlag(localeCode: string): string {
    switch (localeCode) {
      case 'pl': return '🇵🇱';
      case 'en': return '🇺🇸';
      default: return '🌐';
    }
  }
</script>

<div class="language-switcher">
  <div class="language-label">
    <Globe size={18} class="text-text-secondary" strokeWidth={1.5} />
  </div>
  <div class="language-options">
    {#each availableLocales as localeOption}
      <button
        class="language-button"
        class:active={currentLocale === localeOption.code}
        on:click={() => switchLanguage(localeOption.code)}
        title={localeOption.nativeName}
      >
        {getFlag(localeOption.code)} {localeOption.code.toUpperCase()}
      </button>
    {/each}
  </div>
</div>

<style>
  .language-switcher {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }

  .language-label {
    display: flex;
    align-items: center;
  }

  .language-options {
    display: flex;
    gap: 0.25rem;
  }

  .language-button {
    padding: 0.25rem 0.5rem;
    border: 1px solid #404040;
    border-radius: 0.25rem;
    background: #2C2C2C;
    color: #B0B0B0;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .language-button:hover {
    background-color: #404040;
    border-color: #DC143C;
  }

  .language-button.active {
    background-color: #DC143C;
    color: white;
    border-color: #DC143C;
  }

  .language-button.active:hover {
    background-color: #FF0040;
    border-color: #FF0040;
  }
</style>