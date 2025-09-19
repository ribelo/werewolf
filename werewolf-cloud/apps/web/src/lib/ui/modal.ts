import { writable } from 'svelte/store';
import type { ComponentType } from 'svelte';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface ModalConfig<T = unknown> {
  id?: string;
  title?: string;
  content?: string;
  component?: ComponentType; // Svelte component to render in modal
  size?: ModalSize;
  closable?: boolean;
  backdropClosable?: boolean;
  showCloseButton?: boolean;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger' | 'success' | 'warning' | 'info';
  data?: T;
  showFooter?: boolean; // Explicit control over footer visibility
}

export interface ActiveModal<T = unknown> extends ModalConfig<T> {
  id: string;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

type ModalStore = {
  open: <T>(config: ModalConfig<T>) => Promise<T>;
  close: <T>(id: string, result?: T) => void;
  closeAll: () => void;
  subscribe: (fn: (value: ActiveModal<unknown>[]) => void) => () => void;
};

function createModalStore(): ModalStore {
  const { subscribe, set, update } = writable<ActiveModal<unknown>[]>([]);

  function open<T>(config: ModalConfig<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = config.id || crypto.randomUUID();
      const modal: ActiveModal<T> = {
        ...config,
        id,
        resolve,
        reject,
      };

      update(modals => [...modals, modal as ActiveModal<unknown>]);
    });
  }

  function close<T>(id: string, result?: T) {
    update(modals => {
      const modalIndex = modals.findIndex(m => m.id === id);
      if (modalIndex === -1) return modals;

      const modal = modals[modalIndex];
      if (modal) {
        (modal.resolve as (value: T) => void)(result as T);
      }

      return modals.filter(m => m.id !== id);
    });
  }

  function closeAll() {
    update(modals => {
      modals.forEach(modal => {
        modal.reject(new Error('Modal closed by closeAll()'));
      });
      return [];
    });
  }

  return {
    subscribe,
    open,
    close,
    closeAll,
  };
}

export const modalStore = createModalStore();

// Convenience functions for common modal types
export function confirmModal(
  title: string,
  content: string,
  options: Partial<ModalConfig<boolean>> = {}
): Promise<boolean> {
  return modalStore.open<boolean>({
    title,
    content,
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    variant: 'default',
    ...options,
  });
}

export function alertModal(
  title: string,
  content: string,
  options: Partial<ModalConfig<void>> = {}
): Promise<void> {
  return modalStore.open<void>({
    title,
    content,
    confirmText: 'OK',
    variant: 'info',
    ...options,
  });
}

export function dangerModal(
  title: string,
  content: string,
  options: Partial<ModalConfig<boolean>> = {}
): Promise<boolean> {
  return modalStore.open<boolean>({
    title,
    content,
    confirmText: 'Delete',
    cancelText: 'Cancel',
    variant: 'danger',
    ...options,
  });
}