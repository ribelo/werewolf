import { describe, expect, it } from 'vitest';
import { attemptSchema } from '../models/attempt';

describe('attemptSchema', () => {
  it('accepts a valid attempt', () => {
    const result = attemptSchema.safeParse({
      id: crypto.randomUUID(),
      registrationId: crypto.randomUUID(),
      liftType: 'Squat',
      attemptNumber: 1,
      weight: 100,
      status: 'Pending',
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid lift type', () => {
    const result = attemptSchema.safeParse({
      id: crypto.randomUUID(),
      registrationId: crypto.randomUUID(),
      liftType: 'Press',
      attemptNumber: 1,
      weight: 100,
      status: 'Pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(result.success).toBe(false);
  });
});
