import { writable } from 'svelte/store';
import type { ComponentType } from 'svelte';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface ModalConfig<TData = unknown> {
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
  /**
   * Input props for `component`. This is the component shape and is unrelated to
   * the modal result type `TResult`.
   *
   * `data.onSaved` is the caller's persistence hook: the component rendered in
   * the modal calls its `onSaved` prop with the payload that should be
   * persisted, the modal shell awaits the hook with that payload and then
   * resolves the modal promise with it. Without a hook the modal simply
   * resolves with the payload.
   */
  data?: TData;
  showFooter?: boolean; // Explicit control over footer visibility
}

export interface ActiveModal<TResult = unknown, TData = unknown>
  extends ModalConfig<TData> {
  id: string;
  resolve: (value: TResult) => void;
  reject: (error: Error) => void;
}

type ModalStore = {
  open: <TResult = unknown, TData = unknown>(config: ModalConfig<TData>) => Promise<TResult>;
  close: <T>(id: string, result?: T) => void;
  closeAll: () => void;
  subscribe: (fn: (value: ActiveModal[]) => void) => () => void;
};

function createModalStore(): ModalStore {
  const { subscribe, update } = writable<ActiveModal[]>([]);

  function open<TResult = unknown, TData = unknown>(config: ModalConfig<TData>): Promise<TResult> {
    return new Promise<TResult>((resolve, reject) => {
      const id = config.id || crypto.randomUUID();
      const modal: ActiveModal<TResult, TData> = {
        ...config,
        id,
        resolve,
        reject,
      };

      update(modals => [...modals, modal as ActiveModal]);
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

// Body scroll is locked while at least one modal is open; the lock is
// ref-counted so stacked modals do not unlock the page when one of them closes.
let scrollLockCount = 0;
let scrollOverflowBeforeLock: string | null = null;

export function lockBodyScroll(): void {
  if (typeof document === 'undefined') return;

  scrollLockCount += 1;
  if (scrollLockCount > 1) return;

  scrollOverflowBeforeLock = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
}

export function unlockBodyScroll(): void {
  if (typeof document === 'undefined' || scrollLockCount === 0) return;

  scrollLockCount -= 1;
  if (scrollLockCount > 0) return;

  document.body.style.overflow = scrollOverflowBeforeLock ?? '';
  scrollOverflowBeforeLock = null;
}

// Convenience functions for common modal types
export function confirmModal(
  title: string,
  content: string,
  options: Partial<ModalConfig> = {}
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
  options: Partial<ModalConfig> = {}
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
  options: Partial<ModalConfig> = {}
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
