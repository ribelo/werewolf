<script lang="ts">
  import { User } from 'lucide-svelte';
  
  export let competitor: {
    id: string;
    firstName: string;
    lastName: string;
    photoBase64?: string;
    gender: string;
  };
  
  export let size: 'small' | 'medium' | 'large' = 'medium';
  
  let photoSrc: string | null = null;
  
  // Use photo data if available
  $: if (competitor.photoBase64 && competitor.photoBase64.length > 0) {
    // Backend sends base64 encoded data, add data URL prefix
    photoSrc = `data:image/webp;base64,${competitor.photoBase64}`;
  } else {
    photoSrc = null;
  }
  
  // Size classes
  const sizeClasses = {
    small: 'w-8 h-10', // 32x40px (4:5 ratio)
    medium: 'w-12 h-16', // 48x64px (3:4 ratio, close to 4:5)  
    large: 'w-16 h-20' // 64x80px (4:5 ratio)
  };
  
  const iconSizes = {
    small: 16,
    medium: 24,
    large: 32
  };
</script>

<div 
  class="competitor-thumbnail {sizeClasses[size]} relative overflow-hidden rounded border-2 border-border-color bg-element-bg flex items-center justify-center"
  title="{competitor.firstName} {competitor.lastName}"
>
  {#if photoSrc}
    <img 
      src={photoSrc} 
      alt="{competitor.firstName} {competitor.lastName}"
      class="w-full h-full object-cover"
      loading="lazy"
    />
  {:else}
    <!-- Fallback placeholder -->
    <div class="flex flex-col items-center justify-center text-text-secondary">
      <User size={iconSizes[size]} strokeWidth={1.5} />
      {#if size !== 'small'}
        <div class="text-xs mt-1 text-center leading-tight">
          {competitor.gender === 'Male' ? 'M' : 'F'}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .competitor-thumbnail {
    /* Ensure proper aspect ratio */
    aspect-ratio: 4/5;
  }
  
  .competitor-thumbnail img {
    /* Smooth loading transition */
    transition: opacity 0.2s ease;
  }
  
  .competitor-thumbnail:hover {
    border-color: var(--accent-red);
  }
</style>