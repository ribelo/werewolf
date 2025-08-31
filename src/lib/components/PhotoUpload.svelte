<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import PhotoCropper from './PhotoCropper.svelte';

  const dispatch = createEventDispatcher<{
    photoSelected: { base64: string; filename: string };
    photoRemoved: void;
  }>();

  export let currentPhoto: string | null = null; // Base64 photo data
  export let disabled: boolean = false;

  let fileInput: HTMLInputElement;
  let showCropper = false;
  let tempImageSrc = '';
  let originalFilename = '';

  // Quality thresholds based on backend implementation
  const QUALITY_THRESHOLDS = {
    excellent: { width: 800, height: 1000 },
    good: { width: 400, height: 500 },
    fair: { width: 200, height: 250 }
  };

  function assessPhotoQuality(width: number, height: number) {
    if (width >= QUALITY_THRESHOLDS.excellent.width && height >= QUALITY_THRESHOLDS.excellent.height) {
      return {
        level: 'excellent',
        message: 'Excellent quality - perfect for professional use'
      };
    } else if (width >= QUALITY_THRESHOLDS.good.width && height >= QUALITY_THRESHOLDS.good.height) {
      return {
        level: 'good',
        message: 'Good quality - suitable for competition use'
      };
    } else if (width >= QUALITY_THRESHOLDS.fair.width && height >= QUALITY_THRESHOLDS.fair.height) {
      return {
        level: 'fair',
        message: 'Fair quality - acceptable but could be better'
      };
    } else {
      return {
        level: 'poor',
        message: 'Poor quality - image is very small and may appear pixelated'
      };
    }
  }

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (file) {
      originalFilename = file.name;
      
      // Check file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file.');
        return;
      }
      
      // Check file size (limit to 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('File is too large. Please select an image smaller than 10MB.');
        return;
      }

      // Create image to check dimensions
      const img = new Image();
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const result = e.target?.result as string;
        img.onload = () => {
          const quality = assessPhotoQuality(img.naturalWidth, img.naturalHeight);
          
          // Show quality warning for poor quality images
          if (quality.level === 'poor') {
            const proceed = confirm(
              `Warning: ${quality.message}\n\n` +
              `Original size: ${img.naturalWidth}×${img.naturalHeight}px\n` +
              `This will be resized to 400×500px which may look pixelated.\n\n` +
              `Do you want to continue anyway?`
            );
            
            if (!proceed) {
              input.value = ''; // Clear the file input
              return;
            }
          } else {
            // Show quality info for better quality images
            console.log(`Photo quality: ${quality.level} - ${quality.message}`);
          }
          
          // Show cropper
          tempImageSrc = result;
          showCropper = true;
        };
        img.src = result;
      };
      
      reader.readAsDataURL(file);
    }
  }

  function handleCrop(event: CustomEvent<string>) {
    const croppedBase64 = event.detail;
    showCropper = false;
    tempImageSrc = '';
    
    // Dispatch the cropped photo
    dispatch('photoSelected', {
      base64: croppedBase64,
      filename: originalFilename
    });
    
    // Clear the file input
    if (fileInput) {
      fileInput.value = '';
    }
  }

  function handleCropCancel() {
    showCropper = false;
    tempImageSrc = '';
    
    // Clear the file input
    if (fileInput) {
      fileInput.value = '';
    }
  }

  function handleRemovePhoto() {
    if (confirm('Are you sure you want to remove this photo?')) {
      dispatch('photoRemoved');
    }
  }

  function triggerFileSelect() {
    if (fileInput && !disabled) {
      fileInput.click();
    }
  }
</script>

<div class="photo-upload">
  <!-- File input (hidden) -->
  <input
    bind:this={fileInput}
    type="file"
    accept="image/*"
    class="hidden"
    on:change={handleFileSelect}
    {disabled}
  />

  <!-- Photo display area -->
  <div class="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
    {#if currentPhoto}
      <!-- Show current photo -->
      <div class="space-y-4">
        <div class="relative inline-block">
          <img
            src="data:image/webp;base64,{currentPhoto}"
            alt="Competitor photo"
            class="w-32 h-40 object-cover rounded-lg border border-gray-200"
          />
        </div>
        
        <div class="space-x-2">
          <button
            type="button"
            class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
            on:click={triggerFileSelect}
            {disabled}
          >
            Change Photo
          </button>
          <button
            type="button"
            class="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
            on:click={handleRemovePhoto}
            {disabled}
          >
            Remove Photo
          </button>
        </div>
      </div>
    {:else}
      <!-- Upload prompt -->
      <div class="space-y-4">
        <svg
          class="mx-auto h-12 w-12 text-gray-400"
          stroke="currentColor"
          fill="none"
          viewBox="0 0 48 48"
        >
          <path
            d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        
        <div>
          <button
            type="button"
            class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            on:click={triggerFileSelect}
            {disabled}
          >
            Upload Photo
          </button>
          
          <p class="mt-2 text-sm text-gray-600">
            Recommended: 400×500px or larger
          </p>
          <p class="text-xs text-gray-500">
            Supported formats: JPG, PNG, WebP (max 10MB)
          </p>
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- Photo cropper modal -->
{#if showCropper}
  <PhotoCropper
    src={tempImageSrc}
    onCrop={handleCrop}
    onCancel={handleCropCancel}
  />
{/if}