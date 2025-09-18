export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number = 500,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const notImplemented = (feature: string) =>
  new ApiError(`${feature} not implemented`, 501);

export const notFound = (resource: string) =>
  new ApiError(`${resource} not found`, 404);

export const badRequest = (message: string, details?: Record<string, unknown>) =>
  new ApiError(message, 400, details);
