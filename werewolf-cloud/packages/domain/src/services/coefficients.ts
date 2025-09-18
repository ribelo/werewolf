// werewolf/werewolf-cloud/packages/domain/src/services/coefficients.ts

/**
 * Calculate Reshel coefficient based on bodyweight and gender
 * This is a simplified formula - in practice you'd use official IPF tables
 */
export function calculateReshelCoefficient(bodyweight: number, gender: string): number {
  switch (gender.toLowerCase()) {
    case 'male':
    case 'm': {
      const a = -216.0475144;
      const b = 16.2606339;
      const c = -0.002388645;
      const d = -0.00113732;
      const e = 7.01863e-06;
      const f = -1.291e-08;

      const x = bodyweight;
      return 500.0 / (a + b * x + c * x * x + d * x * x * x + e * x * x * x * x + f * x * x * x * x * x);
    }
    case 'female':
    case 'f': {
      const a = 594.31747775582;
      const b = -27.23842536447;
      const c = 0.82112226871;
      const d = -0.00930733913;
      const e = 4.731582e-05;
      const f = -9.054e-08;

      const x = bodyweight;
      return 500.0 / (a + b * x + c * x * x + d * x * x * x + e * x * x * x * x + f * x * x * x * x * x);
    }
    default:
      return 1.0;
  }
}

/**
 * Calculate McCullough coefficient based on age
 * Age adjustment factor for masters/veterans and juniors
 */
export function calculateMcCulloughCoefficient(birthDate: string, contestDate: string): number {
  try {
    const birth = new Date(birthDate);
    const contest = new Date(contestDate);

    // Calculate age on contest date
    const age = contest.getFullYear() - birth.getFullYear();
    const monthDiff = contest.getMonth() - birth.getMonth();
    const actualAge = monthDiff < 0 || (monthDiff === 0 && contest.getDate() < birth.getDate())
      ? age - 1
      : age;

    // McCullough age factors (simplified)
    if (actualAge >= 13 && actualAge <= 15) return 1.13; // Junior 13
    if (actualAge >= 16 && actualAge <= 18) return 1.08; // Junior 16
    if (actualAge === 19) return 1.06; // Junior 19
    if (actualAge >= 20 && actualAge <= 23) return 1.03; // Junior 23
    if (actualAge >= 24 && actualAge <= 39) return 1.0; // Senior
    if (actualAge >= 40 && actualAge <= 44) return 1.01; // Veteran 40
    if (actualAge >= 45 && actualAge <= 49) return 1.02;
    if (actualAge >= 50 && actualAge <= 54) return 1.04; // Veteran 50
    if (actualAge >= 55 && actualAge <= 59) return 1.06;
    if (actualAge >= 60 && actualAge <= 64) return 1.09; // Veteran 60
    if (actualAge >= 65 && actualAge <= 69) return 1.12;
    if (actualAge >= 70 && actualAge <= 74) return 1.16; // Veteran 70
    if (actualAge >= 75 && actualAge <= 79) return 1.21;
    if (actualAge >= 80) return 1.27; // Veteran 80+

    return 1.0; // Default
  } catch (error) {
    console.warn('Failed to calculate McCullough coefficient:', error);
    return 1.0;
  }
}

/**
 * Determine age category based on age
 */
export function determineAgeCategory(birthDate: string, contestDate: string): string {
  try {
    const birth = new Date(birthDate);
    const contest = new Date(contestDate);

    const age = contest.getFullYear() - birth.getFullYear();
    const monthDiff = contest.getMonth() - birth.getMonth();
    const actualAge = monthDiff < 0 || (monthDiff === 0 && contest.getDate() < birth.getDate())
      ? age - 1
      : age;

    if (actualAge >= 13 && actualAge <= 15) return 'JUNIOR13';
    if (actualAge >= 16 && actualAge <= 18) return 'JUNIOR16';
    if (actualAge === 19) return 'JUNIOR19';
    if (actualAge >= 20 && actualAge <= 23) return 'JUNIOR23';
    if (actualAge >= 24 && actualAge <= 39) return 'SENIOR';
    if (actualAge >= 40 && actualAge <= 49) return 'VETERAN40';
    if (actualAge >= 50 && actualAge <= 59) return 'VETERAN50';
    if (actualAge >= 60 && actualAge <= 69) return 'VETERAN60';
    if (actualAge >= 70) return 'VETERAN70';

    return 'SENIOR';
  } catch (error) {
    console.warn('Failed to determine age category:', error);
    return 'SENIOR';
  }
}

/**
 * Determine weight class based on bodyweight and gender
 */
export function determineWeightClass(bodyweight: number, gender: string): string {
  switch (gender.toLowerCase()) {
    case 'male':
    case 'm':
      if (bodyweight <= 52.0) return 'M_52';
      if (bodyweight <= 56.0) return 'M_56';
      if (bodyweight <= 60.0) return 'M_60';
      if (bodyweight <= 67.5) return 'M_67_5';
      if (bodyweight <= 75.0) return 'M_75';
      if (bodyweight <= 82.5) return 'M_82_5';
      if (bodyweight <= 90.0) return 'M_90';
      if (bodyweight <= 100.0) return 'M_100';
      if (bodyweight <= 110.0) return 'M_110';
      if (bodyweight <= 125.0) return 'M_125';
      if (bodyweight <= 140.0) return 'M_140';
      return 'M_140_PLUS';

    case 'female':
    case 'f':
      if (bodyweight <= 47.0) return 'F_47';
      if (bodyweight <= 52.0) return 'F_52';
      if (bodyweight <= 57.0) return 'F_57';
      if (bodyweight <= 63.0) return 'F_63';
      if (bodyweight <= 72.0) return 'F_72';
      if (bodyweight <= 84.0) return 'F_84';
      return 'F_84_PLUS';

    default:
      return 'M_75';
  }
}

/**
 * Calculate total points for a lifter
 */
export function calculatePoints(totalWeight: number, reshel: number, mccullough: number): number {
  if (totalWeight <= 0) return 0;
  return totalWeight * reshel * mccullough;
}