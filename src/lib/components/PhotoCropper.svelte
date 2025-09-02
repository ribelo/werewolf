<script lang="ts">
  import Cropper from 'cropperjs';
  import 'cropperjs/dist/cropper.css';
  import { onMount, onDestroy } from 'svelte';
  import { _ } from 'svelte-i18n';

  export let src: string = '';
  export let onCrop: (croppedBase64: string) => void = () => {};
  export let onCancel: () => void = () => {};

  let cropper: Cropper | null = null;
  let imageElement: HTMLImageElement;
  let isLoaded = false;

  onMount(() => {
    if (imageElement && src) {
      initializeCropper();
    }
  });

  onDestroy(() => {
    if (cropper) {
      cropper.destroy();
    }
  });

  function initializeCropper() {
    if (cropper) {
      cropper.destroy();
    }

    cropper = new Cropper(imageElement, {
      aspectRatio: 4 / 5, // Fixed 4:5 aspect ratio for competitor photos
      viewMode: 2, // Restrict the crop box to not exceed the size of the canvas
      dragMode: 'move', // Define the dragging mode of the cropper
      guides: true, // Show the dashed lines above the crop box
      center: true, // Show the center indicator above the crop box
      cropBoxMovable: true, // Enable to move the crop box
      cropBoxResizable: true, // Enable to resize the crop box
      toggleDragModeOnDblclick: false, // Disable double click to toggle drag mode
      ready() {
        isLoaded = true;
        // Auto-crop to center with maximum size maintaining aspect ratio
        const containerData = cropper!.getContainerData();
        const imageData = cropper!.getImageData();
        
        const aspectRatio = 4 / 5;
        let cropWidth, cropHeight;
        
        // Calculate optimal crop size based on image and container
        if (imageData.naturalWidth / imageData.naturalHeight > aspectRatio) {
          // Image is wider than target ratio
          cropHeight = Math.min(imageData.naturalHeight, containerData.height * 0.8);
          cropWidth = cropHeight * aspectRatio;
        } else {
          // Image is taller than target ratio
          cropWidth = Math.min(imageData.naturalWidth, containerData.width * 0.8);
          cropHeight = cropWidth / aspectRatio;
        }
        
        // Center the crop box
        const x = (containerData.width - cropWidth) / 2;
        const y = (containerData.height - cropHeight) / 2;
        
        cropper!.setCropBoxData({
          left: x,
          top: y,
          width: cropWidth,
          height: cropHeight
        });
      }
    });
  }

  function handleCrop() {
    if (cropper) {
      const canvas = cropper.getCroppedCanvas({
        width: 400,
        height: 500,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high'
      });
      
      const croppedBase64 = canvas.toDataURL('image/webp', 0.85);
      // Remove the data:image/webp;base64, prefix to get just the base64 data
      const base64Data = croppedBase64.split(',')[1];
      onCrop(base64Data);
    }
  }

  function handleCancel() {
    onCancel();
  }

  // Watch for src changes and reinitialize cropper
  $: if (imageElement && src) {
    initializeCropper();
  }
</script>

<div class="photo-cropper-modal fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
  <div class="bg-white rounded-lg p-6 max-w-4xl max-h-screen w-full mx-4 flex flex-col">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold">Crop Photo</h2>
      <div class="text-sm text-gray-600">
        Crop to 4:5 aspect ratio (400×500px)
      </div>
    </div>
    
    <div class="flex-1 overflow-hidden mb-4">
      <div class="cropper-container" style="max-height: 400px;">
        <img
          bind:this={imageElement}
          {src}
          alt="Photo to crop"
          class="max-w-full max-h-full"
          style="display: block;"
        />
      </div>
    </div>

    {#if !isLoaded}
      <div class="flex justify-center items-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span class="ml-2">{$_('common.loading')}</span>
      </div>
    {/if}

    <div class="flex justify-end space-x-3 mt-4">
      <button
        type="button"
        class="px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-700 hover:bg-gray-50"
        on:click={handleCancel}
      >
{$_('buttons.cancel')}
      </button>
      <button
        type="button"
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        disabled={!isLoaded}
        on:click={handleCrop}
      >
{$_('buttons.crop_save')}
      </button>
    </div>
  </div>
</div>

<style>
  /* Override cropper.js styles for better integration */
  :global(.cropper-container) {
    direction: ltr;
    font-size: 0;
    line-height: 0;
    position: relative;
    -ms-touch-action: none;
    touch-action: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
  }

  /* Make sure the cropper fits nicely in our modal */
  :global(.cropper-container img) {
    display: block;
    height: 100%;
    image-orientation: 0deg;
    max-height: none;
    max-width: none;
    min-height: 0;
    min-width: 0;
    width: 100%;
  }
</style>