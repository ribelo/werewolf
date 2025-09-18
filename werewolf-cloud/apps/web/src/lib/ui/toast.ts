export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  message: string;
  tone: ToastTone;
  id: string;
}

export function createToastStore(timeoutMs = 5000) {
  let toasts: Toast[] = [];

  function push(message: string, tone: ToastTone = 'info') {
    const id = crypto.randomUUID();
    const toast: Toast = { message, tone, id };
    toasts = [...toasts, toast];
    setTimeout(() => remove(id), timeoutMs);
    return toast;
  }

  function remove(id: string) {
    toasts = toasts.filter((entry) => entry.id !== id);
  }

  function list() {
    return toasts;
  }

  function toneClass(tone: ToastTone): string {
    if (tone === 'success') return 'border-status-success text-green-200 bg-status-success/30';
    if (tone === 'error') return 'border-status-error text-red-200 bg-status-error/30';
    return 'border-border-color text-text-secondary bg-element-bg';
  }

  return { push, remove, list, toneClass };
}
