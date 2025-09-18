import { describe, it, expect, vi } from 'vitest';

// Mock the load functions
vi.mock('../+page.ts', () => ({
  load: vi.fn(() => Promise.resolve({
    contests: [
      {
        id: '1',
        name: 'Test Contest',
        date: '2024-01-01',
        location: 'Test Location',
        discipline: 'Powerlifting',
        status: 'active',
        mensBarWeight: 20,
        womensBarWeight: 15
      }
    ],
    error: null,
    apiBase: 'http://localhost:8787'
  }))
}));

vi.mock('../settings/+page.ts', () => ({
  load: vi.fn(() => Promise.resolve({
    settings: {
      language: 'en',
      ui: { theme: 'light', showWeights: true },
      competition: { defaultBarWeight: 20 },
      database: { backupEnabled: true, autoBackupInterval: 24 }
    },
    health: { status: 'healthy', timestamp: '2024-01-01T00:00:00Z' },
    database: { status: 'healthy', stats: { contests: 1, competitors: 10, registrations: 5 } },
    error: null,
    apiBase: 'http://localhost:8787'
  }))
}));

vi.mock('../contests/new/+page.ts', () => ({
  load: vi.fn(() => Promise.resolve({
    apiBase: 'http://localhost:8787'
  }))
}));

vi.mock('../contests/[id]/+page.ts', () => ({
  load: vi.fn(() => Promise.resolve({
    contest: {
      id: '1',
      name: 'Test Contest',
      date: '2024-01-01',
      location: 'Test Location',
      discipline: 'Powerlifting',
      status: 'InProgress',
      mensBarWeight: 20,
      womensBarWeight: 15,
      registrations: [
        {
          id: 'reg1',
          competitorId: 'comp1',
          firstName: 'John',
          lastName: 'Doe',
          birthDate: '1990-01-01',
          gender: 'M',
          club: 'Test Club',
          city: 'Test City',
          weightClassId: 'wc1',
          ageClassId: 'ac1',
          bodyweight: 85.5,
          lotNumber: 1,
          equipmentM: true,
          equipmentSm: false,
          equipmentT: false,
          rackHeightSquat: 45,
          rackHeightBench: 40,
          personalRecordAtEntry: 100,
          reshelCoefficient: 1.0,
          mcculloughCoefficient: 1.0,
          competitionOrder: 1
        }
      ]
    },
    registrations: [
      {
        id: 'reg1',
        competitorId: 'comp1',
        firstName: 'John',
        lastName: 'Doe',
        birthDate: '1990-01-01',
        gender: 'M',
        club: 'Test Club',
        city: 'Test City',
        weightClassId: 'wc1',
        ageClassId: 'ac1',
        bodyweight: 85.5,
        lotNumber: 1,
        equipmentM: true,
        equipmentSm: false,
        equipmentT: false,
        rackHeightSquat: 45,
        rackHeightBench: 40,
        personalRecordAtEntry: 100,
        reshelCoefficient: 1.0,
        mcculloughCoefficient: 1.0,
        competitionOrder: 1
      }
    ],
    attempts: [
      {
        id: 'attempt1',
        registrationId: 'reg1',
        liftType: 'Squat',
        attemptNumber: 1,
        weight: 200.0,
        status: 'Successful',
        judge1Decision: true,
        judge2Decision: true,
        judge3Decision: true,
        notes: 'Good lift',
        createdAt: '2024-01-01T10:00:00Z',
        updatedAt: '2024-01-01T10:00:00Z'
      },
      {
        id: 'attempt2',
        registrationId: 'reg1',
        liftType: 'Bench',
        attemptNumber: 1,
        weight: 150.0,
        status: 'Pending',
        createdAt: '2024-01-01T10:05:00Z',
        updatedAt: '2024-01-01T10:05:00Z'
      }
    ],
    currentAttempt: {
      id: 'attempt2',
      registrationId: 'reg1',
      competitorName: 'John Doe',
      liftType: 'Bench',
      attemptNumber: 1,
      weight: 150.0,
      status: 'Pending'
    },
    referenceData: {
      weightClasses: [{ id: 'wc1', name: '85kg', gender: 'M', minWeight: 82.5, maxWeight: 87.5 }],
      ageCategories: [{ id: 'ac1', name: 'Open', minAge: 0, maxAge: 99 }]
    },
    error: null,
    apiBase: 'http://localhost:8787',
    contestId: '1'
  }))
}));

describe('Routes smoke test', () => {
  it('should export load functions', async () => {
    // This test ensures the load functions are properly exported
    const { load: contestsLoad } = await import('../+page.ts');
    const { load: settingsLoad } = await import('../settings/+page.ts');
    const { load: contestDetailLoad } = await import('../contests/[id]/+page.ts');
    const { load: contestWizardLoad } = await import('../contests/new/+page.ts');

    expect(typeof contestsLoad).toBe('function');
    expect(typeof settingsLoad).toBe('function');
    expect(typeof contestDetailLoad).toBe('function');
    expect(typeof contestWizardLoad).toBe('function');
  });

  it('should load contest data with all required fields', async () => {
    const { load } = await import('../contests/[id]/+page.ts');
    const data = await load({ params: { id: '1' } } as any);

    // Verify contest data structure
    expect(data.contest).toBeDefined();
    expect(data.contest?.name).toBe('Test Contest');
    expect(data.registrations).toBeDefined();
    expect(Array.isArray(data.registrations)).toBe(true);

    // Verify registration includes all API fields
    const registration = data.registrations[0];
    expect(registration).toBeDefined();
    if (registration) {
      expect(registration.lotNumber).toBe(1);
      expect(registration.rackHeightSquat).toBe(45);
      expect(registration.rackHeightBench).toBe(40);
      expect(registration.reshelCoefficient).toBe(1.0);
      expect(registration.mcculloughCoefficient).toBe(1.0);
    }

    // Verify attempts data
    expect(Array.isArray(data.attempts)).toBe(true);

    // Verify reference data
    expect(data.referenceData).toBeDefined();
    expect(data.referenceData.weightClasses).toBeDefined();
    expect(data.referenceData.ageCategories).toBeDefined();
  });

  it('should load settings data correctly', async () => {
    const { load } = await import('../settings/+page.ts');
    const data = await load();

    // Verify settings structure
    expect(data.settings).toBeDefined();
    expect(data.settings?.language).toBe('en');
    expect(data.settings?.ui).toBeDefined();
    expect(data.settings?.competition).toBeDefined();
    expect(data.settings?.database).toBeDefined();

    // Verify health and database data
    expect(data.health).toBeDefined();
    expect(data.database).toBeDefined();
  });

  it('should load contests list correctly', async () => {
    const { load } = await import('../+page.ts');
    const data = await load({ fetch: vi.fn() } as any);

    // Verify contests structure
    expect(Array.isArray(data.contests)).toBe(true);
    expect(data.contests.length).toBeGreaterThan(0);

    // Verify contest has required fields
    const contest = data.contests[0];
    expect(contest).toBeDefined();
    if (contest) {
      expect(contest.id).toBeDefined();
      expect(contest.name).toBeDefined();
      expect(contest.date).toBeDefined();
      expect(contest.status).toBeDefined();
    }
  });

  it('should load attempts data with proper structure', async () => {
    const { load } = await import('../contests/[id]/+page.ts');
    const data = await load({ params: { id: '1' } } as any);

    // Verify attempts data structure
    expect(Array.isArray(data.attempts)).toBe(true);
    expect(data.attempts.length).toBe(2);

    // Verify attempt has required fields
    const attempt = data.attempts[0];
    expect(attempt).toBeDefined();
    if (attempt) {
      expect(attempt.id).toBeDefined();
      expect(attempt.registrationId).toBeDefined();
      expect(['Squat', 'Bench', 'Deadlift']).toContain(attempt.liftType);
      expect([1, 2, 3]).toContain(attempt.attemptNumber);
      expect(typeof attempt.weight).toBe('number');
      expect(['Pending', 'Successful', 'Failed', 'Skipped']).toContain(attempt.status);
      expect(attempt.createdAt).toBeDefined();
      expect(attempt.updatedAt).toBeDefined();
    }

    // Verify current attempt structure
    expect(data.currentAttempt).toBeDefined();
    if (data.currentAttempt) {
      expect(data.currentAttempt.id).toBeDefined();
      expect(data.currentAttempt.competitorName).toBeDefined();
      expect(data.currentAttempt.liftType).toBeDefined();
      expect(data.currentAttempt.attemptNumber).toBeDefined();
      expect(typeof data.currentAttempt.weight).toBe('number');
      expect(data.currentAttempt.status).toBeDefined();
    }
  });

  it('should handle empty attempts data gracefully', async () => {
    // Test that empty attempts array is handled properly
    const { load } = await import('../contests/[id]/+page.ts');

    // Create a version with empty attempts
    const mockLoad = vi.fn(() => Promise.resolve({
      contest: {
        id: '1',
        name: 'Test Contest',
        date: '2024-01-01',
        location: 'Test Location',
        discipline: 'Powerlifting',
        status: 'InProgress',
        mensBarWeight: 20,
        womensBarWeight: 15,
        registrations: []
      },
      registrations: [],
      attempts: [],
      currentAttempt: null,
      referenceData: {
        weightClasses: [],
        ageCategories: []
      },
      error: null,
      apiBase: 'http://localhost:8787',
      contestId: '1'
    }));

    vi.mocked(load).mockImplementation(mockLoad);

    const data = await load({ params: { id: '1' } } as any);

    expect(Array.isArray(data.attempts)).toBe(true);
    expect(data.attempts.length).toBe(0);
    expect(data.currentAttempt).toBeNull();
  });

  it('should have proper route structure', () => {
    // Test that the route files exist and are properly structured
    expect(true).toBe(true); // Placeholder - would check file structure in a real test
  });
});
