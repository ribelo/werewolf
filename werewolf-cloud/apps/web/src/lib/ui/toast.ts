import { writable } from 'svelte/store';

export type ToastLevel = 'success' | 'error' | 'warning' | 'info';
export type ToastPosition = 'top-right' | 'top-center' | 'top-left' | 'bottom-right' | 'bottom-center' | 'bottom-left';

export interface ToastAction {
  label: string;
  callback: () => void;
  variant?: 'primary' | 'secondary';
}

export interface ToastConfig {
  message: string;
  level: ToastLevel;
  duration?: number; // milliseconds, 0 for no auto-dismiss
  actions?: ToastAction[];
  position?: ToastPosition;
  id?: string;
}

export interface Toast extends ToastConfig {
  id: string;
  createdAt: number;
  timeoutId?: number;
}

interface ToastStore {
  subscribe: (callback: (value: Toast[]) => void) => () => void;
  success: (message: string, options?: Partial<Omit<ToastConfig, 'message' | 'level'>>) => string;
  error: (message: string, options?: Partial<Omit<ToastConfig, 'message' | 'level'>>) => string;
  warning: (message: string, options?: Partial<Omit<ToastConfig, 'message' | 'level'>>) => string;
  info: (message: string, options?: Partial<Omit<ToastConfig, 'message' | 'level'>>) => string;
  push: (config: ToastConfig) => string;
  remove: (id: string) => void;
  clear: () => void;
}

const MAX_TOASTS = 5;
const DEFAULT_DURATION = 5000;

function createToastStore(): ToastStore {
  const { subscribe, set, update } = writable<Toast[]>([]);

  function addToast(config: ToastConfig): string {
    const id = config.id || crypto.randomUUID();

    if (config.level === 'success' || config.level === 'info') {
      console.debug?.('[toast] Suppressed', config.level, config.message);
      return id;
    }

    const toast: Toast = {
      ...config,
      id,
      createdAt: Date.now(),
      duration: config.duration ?? DEFAULT_DURATION,
      position: config.position ?? 'bottom-right',
    };

    update(toasts => {
      // Remove oldest toast if at limit
      const newToasts = toasts.length >= MAX_TOASTS ? toasts.slice(1) : toasts;

      // Set up auto-dismiss if duration > 0
      if (toast.duration && toast.duration > 0) {
        toast.timeoutId = window.setTimeout(() => {
          remove(id);
        }, toast.duration);
      }

      return [...newToasts, toast];
    });

    return id;
  }

  function remove(id: string) {
    update(toasts => {
      const toast = toasts.find(t => t.id === id);
      if (toast?.timeoutId) {
        clearTimeout(toast.timeoutId);
      }
      return toasts.filter(t => t.id !== id);
    });
  }

  function clear() {
    update(toasts => {
      toasts.forEach(toast => {
        if (toast.timeoutId) {
          clearTimeout(toast.timeoutId);
        }
      });
      return [];
    });
  }

  return {
    subscribe,

    success: (message: string, options?: Partial<Omit<ToastConfig, 'message' | 'level'>>) =>
      addToast({ message, level: 'success', ...options }),

    error: (message: string, options?: Partial<Omit<ToastConfig, 'message' | 'level'>>) =>
      addToast({ message, level: 'error', ...options }),

    warning: (message: string, options?: Partial<Omit<ToastConfig, 'message' | 'level'>>) =>
      addToast({ message, level: 'warning', ...options }),

    info: (message: string, options?: Partial<Omit<ToastConfig, 'message' | 'level'>>) =>
      addToast({ message, level: 'info', ...options }),

    push: (config: ToastConfig) => addToast(config),

    remove,
    clear,
  };
}

// Export singleton instance
export const toast = createToastStore();

// Utility functions for backward compatibility
export function toneClass(level: ToastLevel): string {
  switch (level) {
    case 'success':
      return 'border-status-success text-green-100 bg-status-success shadow-glow';
    case 'error':
      return 'border-status-error text-red-100 bg-status-error shadow-glow';
    case 'warning':
      return 'border-status-warning text-black bg-status-warning shadow-glow';
    case 'info':
    default:
      return 'border-border-color text-text-primary bg-element-bg shadow-card';
  }
}

export function getIcon(level: ToastLevel): string {
  switch (level) {
    case 'success': return '✓';
    case 'error': return '✕';
    case 'warning': return '⚠';
    case 'info': return 'ℹ';
    default: return 'ℹ';
  }
}
