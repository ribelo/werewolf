import { get, writable, type Writable } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { apiClient, type ApiResponse, type MutationOutcome } from '$lib/api';
import { toast } from '$lib/ui/toast';
import type {
  BackupCreateResult,
  BackupRecord,
  BackupSnapshot,
  BackupSummary,
} from '$lib/types';

export type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;
export type TranslateFn = (key: string, values?: MessageValues) => string;

/** The Worker calls the settings page makes to back up, restore or reset data. */
export interface BackupApi {
  get<T>(endpoint: string): Promise<ApiResponse<T>>;
  post<T>(endpoint: string, data?: unknown): Promise<MutationOutcome<T>>;
  delete<T>(endpoint: string): Promise<MutationOutcome<T>>;
}

export interface BackupNotifier {
  success(message: string): unknown;
  error(message: string): unknown;
}

export type DownloadFile = (filename: string, contents: string) => void;

export interface BackupControllerDeps {
  api: BackupApi;
  t: TranslateFn;
  notify: BackupNotifier;
  confirm: (message: string) => boolean;
  downloadFile: DownloadFile;
}

export interface BackupControllerOptions extends Partial<BackupControllerDeps> {
  summary?: BackupSummary | null;
  error?: string | null;
}

export interface BackupState {
  summary: BackupSummary | null;
  error: string | null;
  loading: boolean;
  busy: boolean;
  restoringId: string | null;
  downloadingId: string | null;
  deletingId: string | null;
  importing: boolean;
  resetting: boolean;
}

export interface BackupController {
  state: Writable<BackupState>;
  refresh(): Promise<void>;
  create(): Promise<void>;
  download(backup: BackupRecord): Promise<void>;
  restore(backup: BackupRecord): Promise<void>;
  remove(backup: BackupRecord): Promise<void>;
  importFile(file: File): Promise<void>;
  resetDatabase(): Promise<void>;
}

/** Translates a key, falling back to the key itself when locales are not ready. */
export const formatMessage: TranslateFn = (key, values) => {
  try {
    const translate = get(_);
    const result = translate(key, values ? { values } : undefined);
    return typeof result === 'string' ? result : String(result);
  } catch {
    return key;
  }
};

function browserConfirm(message: string): boolean {
  return typeof window === 'undefined' ? true : window.confirm(message);
}

function browserDownload(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Backups, restores and resets are never queued offline: when the transport
 * cannot reach the server it throws (kind 'offline') instead of queueing the
 * call. A queued receipt therefore always means "nothing happened on the
 * server" and must surface as a failure, never as a success.
 */
function unwrapMutation<T>(outcome: MutationOutcome<T>, t: TranslateFn): T | undefined {
  if (outcome.queued) {
    throw new Error(t('settings_page.offline_error'));
  }
  if (outcome.error) {
    throw new Error(outcome.error);
  }
  return outcome.data;
}

/** Matches the transport's ApiError without importing the class. */
function isOfflineError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (error as { kind?: unknown }).kind === 'offline';
}

function describeError(error: unknown, t: TranslateFn, fallbackKey: string): string {
  if (isOfflineError(error)) {
    return t('settings_page.offline_error');
  }
  return error instanceof Error ? error.message : t(fallbackKey);
}

export function createBackupController(options: BackupControllerOptions = {}): BackupController {
  const deps: BackupControllerDeps = {
    api: options.api ?? apiClient,
    t: options.t ?? formatMessage,
    notify: options.notify ?? toast,
    confirm: options.confirm ?? browserConfirm,
    downloadFile: options.downloadFile ?? browserDownload,
  };

  const state = writable<BackupState>({
    summary: options.summary ?? null,
    error: options.error ?? null,
    loading: false,
    busy: false,
    restoringId: null,
    downloadingId: null,
    deletingId: null,
    importing: false,
    resetting: false,
  });

  const patch = (changes: Partial<BackupState>) =>
    state.update((current) => ({ ...current, ...changes }));

  async function refresh(): Promise<void> {
    patch({ loading: true });
    try {
      const response = await deps.api.get<BackupSummary>('/system/backups');
      patch({ summary: response.data ?? null, error: response.error });
    } catch (error) {
      patch({ error: describeError(error, deps.t, 'settings_page.toast_error') });
    } finally {
      patch({ loading: false });
    }
  }

  async function create(): Promise<void> {
    patch({ busy: true });
    try {
      const data = unwrapMutation(await deps.api.post<BackupCreateResult>('/system/backups'), deps.t);
      deps.notify.success(deps.t('settings_page.backup_created', { id: data?.backupId ?? '' }));
      await refresh();
    } catch (error) {
      deps.notify.error(describeError(error, deps.t, 'settings_page.toast_error'));
    } finally {
      patch({ busy: false });
    }
  }

  async function download(backup: BackupRecord): Promise<void> {
    if (typeof document === 'undefined') {
      deps.notify.error(deps.t('settings_page.download_error'));
      return;
    }

    patch({ downloadingId: backup.id });
    try {
      const response = await deps.api.get<BackupSnapshot>(`/system/backups/${backup.id}`);
      if (response.error) {
        throw new Error(response.error);
      }
      const snapshot = response.data;
      if (!snapshot) {
        throw new Error(deps.t('settings_page.download_error'));
      }

      const filename = backup.id.endsWith('.json') ? backup.id : `${backup.id}.json`;
      deps.downloadFile(filename, JSON.stringify(snapshot, null, 2));
      deps.notify.success(deps.t('settings_page.download_success'));
    } catch (error) {
      deps.notify.error(describeError(error, deps.t, 'settings_page.download_error'));
    } finally {
      patch({ downloadingId: null });
    }
  }

  async function restore(backup: BackupRecord): Promise<void> {
    const confirmation = [
      deps.t('backup.confirm_restore_title'),
      '',
      deps.t('backup.confirm_restore_warning'),
      `${deps.t('backup.confirm_restore_backup')} ${backup.id}`,
      deps.t('backup.confirm_restore_safety'),
    ].join('\n');

    if (!deps.confirm(confirmation)) return;

    patch({ busy: true, restoringId: backup.id });
    try {
      const data = unwrapMutation(
        await deps.api.post<{ success: boolean; message?: string }>(
          `/system/backups/${backup.id}/restore`,
        ),
        deps.t,
      );
      deps.notify.success(data?.message ?? deps.t('settings_page.restore_success'));
      await refresh();
    } catch (error) {
      deps.notify.error(describeError(error, deps.t, 'settings_page.restore_error'));
    } finally {
      patch({ busy: false, restoringId: null });
    }
  }

  async function remove(backup: BackupRecord): Promise<void> {
    if (!deps.confirm(deps.t('settings_page.delete_backup_confirm'))) return;

    patch({ busy: true, deletingId: backup.id });
    try {
      unwrapMutation(
        await deps.api.delete<{ success: boolean }>(`/system/backups/${backup.id}`),
        deps.t,
      );
      deps.notify.success(deps.t('settings_page.delete_success'));
      await refresh();
    } catch (error) {
      deps.notify.error(describeError(error, deps.t, 'settings_page.delete_error'));
    } finally {
      patch({ busy: false, deletingId: null });
    }
  }

  async function importFile(file: File): Promise<void> {
    patch({ busy: true, importing: true });
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        throw new Error(deps.t('settings_page.import_error'));
      }

      unwrapMutation(
        await deps.api.post<{ success: boolean; backupId: string }>('/system/backups/import', parsed),
        deps.t,
      );
      deps.notify.success(deps.t('settings_page.import_success'));
      await refresh();
    } catch (error) {
      deps.notify.error(describeError(error, deps.t, 'settings_page.import_error'));
    } finally {
      patch({ busy: false, importing: false });
    }
  }

  async function resetDatabase(): Promise<void> {
    if (!deps.confirm(deps.t('settings.reset_database_warning'))) return;

    patch({ resetting: true });
    try {
      const data = unwrapMutation(
        await deps.api.post<{ success: boolean; message?: string }>('/system/database/reset', {
          confirm: 'YES_I_WANT_TO_RESET_THE_DATABASE',
        }),
        deps.t,
      );
      deps.notify.success(data?.message ?? deps.t('settings_page.reset_success'));
    } catch (error) {
      deps.notify.error(describeError(error, deps.t, 'settings_page.reset_error'));
    } finally {
      patch({ resetting: false });
    }
  }

  return { state, refresh, create, download, restore, remove, importFile, resetDatabase };
}
