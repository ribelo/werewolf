<script lang="ts">
  import { locale, _ } from 'svelte-i18n';
  import { availableLocales, changeLanguage } from '../i18n/index';
  import { Globe } from 'lucide-svelte';
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';

  let currentLocale: string = 'pl';
  let isChanging: boolean = false;
  
  onMount(async () => {
    // Load current language from backend settings
    try {
      const savedLanguage = await invoke<string>('settings_get_language');
      if (savedLanguage && savedLanguage !== currentLocale) {
        currentLocale = savedLanguage;
        locale.set(savedLanguage);
        console.log('✅ Loaded language from settings:', savedLanguage);
      }
    } catch (error) {
      console.error('❌ Failed to load language from settings:', error);
    }

    // Subscribe to locale changes from svelte-i18n
    const unsubscribeLocale = locale.subscribe((value) => {
      if (value) {
        currentLocale = value;
      }
    });
    
    return unsubscribeLocale;
  });

  async function switchLanguage(newLocale: string) {
    if (isChanging || currentLocale === newLocale) return;
    
    isChanging = true;
    try {
      await changeLanguage(newLocale);
    } catch (error) {
      console.error('Failed to switch language:', error);
      // Show error to user if needed
    } finally {
      isChanging = false;
    }
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
        class:changing={isChanging}
        disabled={isChanging}
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

  .language-button.changing {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .language-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>