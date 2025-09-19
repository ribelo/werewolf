/**
 * Modal System Usage Examples
 *
 * This file demonstrates how to use the modal system throughout the application.
 * Import the modalStore and convenience functions to create various types of modals.
 */

import { modalStore, confirmModal, alertModal, dangerModal } from './modal';

// Example 1: Basic confirmation modal
export async function exampleConfirm() {
  try {
    const result = await confirmModal(
      'Confirm Action',
      'Are you sure you want to proceed with this action?',
      {
        size: 'md',
        variant: 'default',
      }
    );

    if (result) {
      console.log('User confirmed the action');
      // Perform the action
    } else {
      console.log('User cancelled the action');
    }
  } catch (error) {
    console.error('Modal was closed without confirmation:', error);
  }
}

// Example 2: Danger confirmation (for destructive actions)
export async function exampleDangerConfirm() {
  try {
    const result = await dangerModal(
      'Delete Item',
      'This action cannot be undone. Are you sure you want to delete this item?',
      {
        size: 'sm',
        confirmText: 'Delete',
        cancelText: 'Keep',
      }
    );

    if (result) {
      console.log('User confirmed deletion');
      // Delete the item
    }
  } catch (error) {
    console.log('Deletion cancelled');
  }
}

// Example 3: Simple alert modal
export async function exampleAlert() {
  try {
    await alertModal(
      'Success!',
      'Your changes have been saved successfully.',
      {
        variant: 'success',
      }
    );
    console.log('User acknowledged the alert');
  } catch (error) {
    console.log('Alert was dismissed');
  }
}

// Example 4: Custom modal with complex content
export async function exampleCustomModal() {
  try {
    const userData = await modalStore.open({
      title: 'User Profile',
      size: 'lg',
      closable: true,
      backdropClosable: false,
      confirmText: 'Save Profile',
      cancelText: 'Cancel',
      data: {
        name: 'John Doe',
        email: 'john@example.com',
      },
    });

    console.log('User data:', userData);
    // Process the returned data
  } catch (error) {
    console.log('Custom modal was cancelled');
  }
}

// Example 5: Modal with custom component (using slots)
export async function exampleComponentModal() {
  try {
    const result = await modalStore.open({
      title: 'Custom Form',
      size: 'xl',
      confirmText: 'Submit',
      cancelText: 'Cancel',
      data: {
        formData: {},
      },
    });

    console.log('Form result:', result);
  } catch (error) {
    console.log('Form modal was cancelled');
  }
}

// Example 6: Programmatically closing modals
export async function exampleProgrammaticClose() {
  // Open a modal
  const modalPromise = modalStore.open({
    title: 'Loading...',
    content: 'Please wait while we process your request.',
    closable: false,
    showCloseButton: false,
  });

  // Simulate some async operation
  setTimeout(() => {
    // Close the modal programmatically
    modalStore.closeAll();
  }, 2000);

  try {
    await modalPromise;
  } catch (error) {
    console.log('Modal was closed programmatically');
  }
}

// Example 7: Multiple stacked modals
export async function exampleStackedModals() {
  try {
    // First modal
    const firstResult = await confirmModal('First Step', 'Do you want to continue?');
    if (!firstResult) return;

    // Second modal (stacks on top of first)
    const secondResult = await confirmModal('Second Step', 'Are you really sure?');
    if (!secondResult) return;

    // Third modal (stacks on top of both)
    await alertModal('Success!', 'All steps completed successfully!');
  } catch (error) {
    console.log('Modal flow was interrupted');
  }
}