import { get as readState } from 'svelte/store';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { ApiError } from '$lib/api';
import type { BackupRecord, BackupSummary } from '$lib/types';
import { createBackupController, type BackupApi } from '../backup-workflows';

const record: BackupRecord = {
  id: 'backup-1.json',
  timestamp: '2026-01-01T10:00:00.000Z',
  size: 1024,
  recordCounts: { contests: 1, competitors: 2, registrations: 3, attempts: 4, results: 0 },
};

const summary: BackupSummary = {
  backups: [record],
  total: 1,
  timestamp: '2026-01-01T10:00:00.000Z',
};

interface Harness {
  controller: ReturnType<typeof createBackupController>;
  getMock: Mock;
  postMock: Mock;
  deleteMock: Mock;
  success: Mock;
  failure: Mock;
  confirm: Mock;
}

function harness(options: { getMock?: Mock; postMock?: Mock; confirmAnswer?: boolean } = {}): Harness {
  const getMock = options.getMock ?? vi.fn(async () => ({ data: summary, error: null }));
  const postMock = options.postMock ?? vi.fn(async () => ({ data: { success: true }, error: null }));
  const deleteMock = vi.fn(async () => ({ data: { success: true }, error: null }));
  const success = vi.fn();
  const failure = vi.fn();
  const confirm = vi.fn(() => options.confirmAnswer ?? true);

  const api = {
    get: getMock as unknown as BackupApi['get'],
    post: postMock as unknown as BackupApi['post'],
    delete: deleteMock as unknown as BackupApi['delete'],
  };

  const controller = createBackupController({
    api,
    t: (key) => key,
    notify: { success, error: failure },
    confirm,
    downloadFile: vi.fn(),
    summary,
  });

  return { controller, getMock, postMock, deleteMock, success, failure, confirm };
}

function offlineError(): ApiError {
  return new ApiError('api.offline.not_queueable', 0, { kind: 'offline' });
}

describe('settings backup/restore/reset workflows', () => {
  it('reports an offline restore as a failure instead of queueing it', async () => {
    const postMock = vi.fn(async () => {
      throw offlineError();
    });
    const { controller, success, failure } = harness({ postMock });

    await controller.restore(record);

    expect(failure).toHaveBeenCalledWith('settings_page.offline_error');
    expect(success).not.toHaveBeenCalled();
    expect(readState(controller.state).restoringId).toBeNull();
    expect(readState(controller.state).busy).toBe(false);
  });

  it('reports an offline database reset as a failure instead of queueing it', async () => {
    const postMock = vi.fn(async () => {
      throw offlineError();
    });
    const { controller, success, failure } = harness({ postMock });

    await controller.resetDatabase();

    expect(postMock).toHaveBeenCalledWith('/system/database/reset', {
      confirm: 'YES_I_WANT_TO_RESET_THE_DATABASE',
    });
    expect(failure).toHaveBeenCalledWith('settings_page.offline_error');
    expect(success).not.toHaveBeenCalled();
    expect(readState(controller.state).resetting).toBe(false);
  });

  it('never reports a queued mutation as a completed restore', async () => {
    const postMock = vi.fn(async () => ({
      queued: true,
      data: null,
      error: null,
      requestId: null,
      mutationId: 'mutation-1',
    }));
    const { controller, success, failure } = harness({ postMock });

    await controller.restore(record);

    expect(failure).toHaveBeenCalledWith('settings_page.offline_error');
    expect(success).not.toHaveBeenCalled();
  });

  it('does not reset the database when the operator cancels the confirmation', async () => {
    const { controller, postMock } = harness({ confirmAnswer: false });

    await controller.resetDatabase();

    expect(postMock).not.toHaveBeenCalled();
  });

  it('restores a backup and refreshes the stored backup list', async () => {
    const { controller, getMock, postMock, success } = harness();

    await controller.restore(record);

    expect(postMock).toHaveBeenCalledWith(`/system/backups/${record.id}/restore`);
    expect(getMock).toHaveBeenCalledWith('/system/backups');
    expect(success).toHaveBeenCalled();
  });
});
