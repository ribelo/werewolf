import { describe, expect, it } from 'vitest';
import { 
  computeResult, 
  calculateRanking, 
  type ScoreComputationContext,
  type ScoreResult 
} from '../services/score-engine';
import { calculateReshelCoefficient, calculateMcCulloughCoefficient } from '../services/coefficients';

describe('Score Engine', () => {
  describe('computeResult', () => {
    it('calculates result correctly with successful attempts', () => {
      const context: ScoreComputationContext = {
        attempts: [
          { status: 'Successful', weight: 200, liftType: 'Squat' },
          { status: 'Successful', weight: 150, liftType: 'Bench' },
          { status: 'Successful', weight: 250, liftType: 'Deadlift' },
          { status: 'Failed', weight: 210, liftType: 'Squat' }, // Failed attempt should be ignored
        ],
        coefficients: {
          reshel: 0.8,
          mccullough: 1.1,
        },
      };

      const result = computeResult(context);

      expect(result.bestSquat).toBe(200);
      expect(result.bestBench).toBe(150);
      expect(result.bestDeadlift).toBe(250);
      expect(result.totalWeight).toBe(600);
      expect(result.coefficientPoints).toBe(600 * 0.8 * 1.1);
      expect(result.isDisqualified).toBe(false);
    });

    it('handles missing attempts correctly', () => {
      const context: ScoreComputationContext = {
        attempts: [
          { status: 'Successful', weight: 200, liftType: 'Squat' },
          { status: 'Successful', weight: 150, liftType: 'Bench' },
          // No deadlift attempts
        ],
        coefficients: {
          reshel: 1.0,
          mccullough: 1.0,
        },
      };

      const result = computeResult(context);

      expect(result.bestSquat).toBe(200);
      expect(result.bestBench).toBe(150);
      expect(result.bestDeadlift).toBe(0);
      expect(result.totalWeight).toBe(350);
      expect(result.isDisqualified).toBe(true);
      expect(result.disqualificationReason).toBe('Missing required lifts');
    });

    it('uses default coefficients when not provided', () => {
      const context: ScoreComputationContext = {
        attempts: [
          { status: 'Successful', weight: 100, liftType: 'Squat' },
          { status: 'Successful', weight: 100, liftType: 'Bench' },
          { status: 'Successful', weight: 100, liftType: 'Deadlift' },
        ],
        coefficients: {}, // Empty coefficients
      };

      const result = computeResult(context);

      expect(result.totalWeight).toBe(300);
      expect(result.coefficientPoints).toBe(300 * 1.0 * 1.0); // Should use defaults
    });

    it('ignores pending and skipped attempts', () => {
      const context: ScoreComputationContext = {
        attempts: [
          { status: 'Successful', weight: 200, liftType: 'Squat' },
          { status: 'Pending', weight: 250, liftType: 'Squat' }, // Should be ignored
          { status: 'Skipped', weight: 150, liftType: 'Bench' }, // Should be ignored
          { status: 'Successful', weight: 100, liftType: 'Bench' },
          { status: 'Successful', weight: 250, liftType: 'Deadlift' },
        ],
        coefficients: {
          reshel: 1.0,
          mccullough: 1.0,
        },
      };

      const result = computeResult(context);

      expect(result.bestSquat).toBe(200); // Only successful attempt
      expect(result.bestBench).toBe(100); // Only successful attempt
      expect(result.bestDeadlift).toBe(250);
      expect(result.totalWeight).toBe(550);
    });

    it('handles empty attempts array', () => {
      const context: ScoreComputationContext = {
        attempts: [],
        coefficients: {
          reshel: 1.0,
          mccullough: 1.0,
        },
      };

      const result = computeResult(context);

      expect(result.bestSquat).toBe(0);
      expect(result.bestBench).toBe(0);
      expect(result.bestDeadlift).toBe(0);
      expect(result.totalWeight).toBe(0);
      expect(result.coefficientPoints).toBe(0);
      expect(result.isDisqualified).toBe(true);
    });
  });

  describe('calculateRanking', () => {
    it('ranks results by coefficient points and total weight', () => {
      const results: ScoreResult[] = [
        {
          bestSquat: 200, bestBench: 150, bestDeadlift: 250,
          totalWeight: 600, coefficientPoints: 480, isDisqualified: false
        },
        {
          bestSquat: 180, bestBench: 140, bestDeadlift: 230,
          totalWeight: 550, coefficientPoints: 500, isDisqualified: false
        },
        {
          bestSquat: 190, bestBench: 145, bestDeadlift: 240,
          totalWeight: 575, coefficientPoints: 480, isDisqualified: false
        },
      ];

      const ranked = calculateRanking(results);

      expect(ranked).toHaveLength(3);
      const [first, second, third] = ranked;
      expect(first!.place).toBe(1); // Highest coefficient points
      expect(second!.place).toBe(2); // Second highest coefficient points
      expect(third!.place).toBe(3); // Third highest coefficient points
    });

    it('handles ties by total weight', () => {
      const results: ScoreResult[] = [
        {
          bestSquat: 200, bestBench: 150, bestDeadlift: 250,
          totalWeight: 600, coefficientPoints: 480, isDisqualified: false
        },
        {
          bestSquat: 190, bestBench: 145, bestDeadlift: 240,
          totalWeight: 575, coefficientPoints: 480, isDisqualified: false // Same coefficient points
        },
      ];

      const ranked = calculateRanking(results);

      expect(ranked).toHaveLength(2);
      const [first, second] = ranked;
      expect(first!.place).toBe(1); // Higher total weight wins tie
      expect(second!.place).toBe(2);
    });

    it('excludes disqualified lifters from ranking', () => {
      const results: ScoreResult[] = [
        {
          bestSquat: 200, bestBench: 150, bestDeadlift: 0,
          totalWeight: 350, coefficientPoints: 280, isDisqualified: true
        },
        {
          bestSquat: 180, bestBench: 140, bestDeadlift: 230,
          totalWeight: 550, coefficientPoints: 440, isDisqualified: false
        },
      ];

      const ranked = calculateRanking(results);

      expect(ranked).toHaveLength(1);
      const [first] = ranked;
      expect(first!.place).toBe(1);
      expect(first!.totalWeight).toBe(550);
    });
  });
});

describe('Coefficient Calculations', () => {
  describe('calculateReshelCoefficient', () => {
    it('calculates coefficient for male lifter', () => {
      const coeff = calculateReshelCoefficient(82.5, 'Male');
      expect(coeff).toBeGreaterThan(0.6);
      expect(coeff).toBeLessThan(0.8);
    });

    it('calculates coefficient for female lifter', () => {
      const coeff = calculateReshelCoefficient(63, 'Female');
      expect(coeff).toBeGreaterThan(0.9);
      expect(coeff).toBeLessThan(1.2);
    });

    it('returns default coefficient for unknown gender', () => {
      const coeff = calculateReshelCoefficient(80, 'Unknown');
      expect(coeff).toBe(1.0);
    });
  });

  describe('calculateMcCulloughCoefficient', () => {
    it('calculates junior coefficient', () => {
      const coeff = calculateMcCulloughCoefficient('2008-01-01', '2025-01-01');
      expect(coeff).toBe(1.08); // Junior 16 (age 17)
    });

    it('calculates senior coefficient', () => {
      const coeff = calculateMcCulloughCoefficient('1995-01-01', '2025-01-01');
      expect(coeff).toBe(1.0); // Senior
    });

    it('calculates veteran coefficient', () => {
      const coeff = calculateMcCulloughCoefficient('1960-01-01', '2025-01-01');
      expect(coeff).toBe(1.12); // Veteran 60-64 (age 65)
    });

    it('handles invalid dates gracefully', () => {
      const coeff = calculateMcCulloughCoefficient('invalid-date', '2025-01-01');
      expect(coeff).toBe(1.0); // Default
    });
  });
});
