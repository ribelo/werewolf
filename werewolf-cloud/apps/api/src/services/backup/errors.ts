export type BackupErrorStatus = 400 | 404 | 500;

/** Backup failures that map onto a specific HTTP status in the system routes. */
export class BackupError extends Error {
  readonly status: BackupErrorStatus;

  constructor(message: string, status: BackupErrorStatus) {
    super(message);
    this.name = 'BackupError';
    this.status = status;
  }
}

export class BackupNotFoundError extends BackupError {
  constructor(message = 'Backup not found') {
    super(message, 404);
    this.name = 'BackupNotFoundError';
  }
}

export class BackupPayloadError extends BackupError {
  constructor(message: string) {
    super(message, 400);
    this.name = 'BackupPayloadError';
  }
}

export class BackupCorruptError extends BackupError {
  constructor(message = 'Backup is corrupted or in an unexpected format') {
    super(message, 500);
    this.name = 'BackupCorruptError';
  }
}
