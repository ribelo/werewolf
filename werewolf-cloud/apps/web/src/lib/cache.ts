import type {
  ContestDetail,
  Registration,
  Attempt,
  CurrentAttemptBundle,
  ReferenceData,
  ContestPlateSetEntry,
} from './types';

interface CacheData {
  contest: ContestDetail;
  registrations: Registration[];
  attempts: Attempt[];
  currentAttempt: CurrentAttemptBundle | null;
  referenceData: ReferenceData;
  plateSets?: ContestPlateSetEntry[];
  timestamp: number;
}

const CACHE_KEY_PREFIX = 'werewolf_cache_';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

function getStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    return localStorage;
  } catch {
    return null;
  }
}

export class OfflineCache {
  private contestId: string;

  constructor(contestId: string) {
    this.contestId = contestId;
  }

  private getCacheKey(): string {
    return `${CACHE_KEY_PREFIX}${this.contestId}`;
  }

  // Store data in localStorage
  set(data: {
    contest: ContestDetail;
    registrations: Registration[];
    attempts: Attempt[];
    currentAttempt: CurrentAttemptBundle | null;
    referenceData: ReferenceData;
    plateSets?: ContestPlateSetEntry[];
  }): void {
    const storage = getStorage();
    if (!storage) return;

    try {
      const cacheData: CacheData = {
        ...data,
        plateSets: data.plateSets ?? [],
        timestamp: Date.now(),
      };

      storage.setItem(this.getCacheKey(), JSON.stringify(cacheData));
      console.log('Data cached for contest:', this.contestId);
    } catch (error) {
      console.error('Failed to cache data:', error);
    }
  }

  // Retrieve data from localStorage
  get(): CacheData | null {
    const storage = getStorage();
    if (!storage) return null;

    try {
      const cached = storage.getItem(this.getCacheKey());
      if (!cached) return null;

      const cacheData: CacheData = JSON.parse(cached);

      // Check if cache is expired
      if (Date.now() - cacheData.timestamp > CACHE_EXPIRY) {
        console.log('Cache expired for contest:', this.contestId);
        this.clear();
        return null;
      }

      console.log('Retrieved cached data for contest:', this.contestId);
      return {
        ...cacheData,
        plateSets: cacheData.plateSets ?? [],
      };
    } catch (error) {
      console.error('Failed to retrieve cached data:', error);
      return null;
    }
  }

  // Check if valid cache exists
  hasValidCache(): boolean {
    const cached = this.get();
    return cached !== null;
  }

  // Clear cache for this contest
  clear(): void {
    const storage = getStorage();
    if (!storage) return;

    try {
      storage.removeItem(this.getCacheKey());
      console.log('Cache cleared for contest:', this.contestId);
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }

  // Get cache age in minutes
  getCacheAge(): number | null {
    const storage = getStorage();
    if (!storage) return null;

    try {
      const cached = storage.getItem(this.getCacheKey());
      if (!cached) return null;

      const cacheData: CacheData = JSON.parse(cached);
      return Math.floor((Date.now() - cacheData.timestamp) / (1000 * 60));
    } catch (error) {
      return null;
    }
  }

  // Update specific parts of the cache
  updateAttempts(attempts: Attempt[]): void {
    const cached = this.get();
    if (cached) {
      cached.attempts = attempts;
      cached.timestamp = Date.now();
      try {
        const storage = getStorage();
        if (!storage) return;
        storage.setItem(this.getCacheKey(), JSON.stringify(cached));
      } catch (error) {
        console.error('Failed to update attempts in cache:', error);
      }
    }
  }

  updateCurrentAttempt(currentAttempt: CurrentAttemptBundle | null): void {
    const cached = this.get();
    if (cached) {
      cached.currentAttempt = currentAttempt;
      cached.timestamp = Date.now();
      try {
        const storage = getStorage();
        if (!storage) return;
        storage.setItem(this.getCacheKey(), JSON.stringify(cached));
      } catch (error) {
        console.error('Failed to update current attempt in cache:', error);
      }
    }
  }
}

// Utility functions for cache management
export function clearAllCache(): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    const keys = Object.keys(storage);
    keys.forEach(key => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        storage.removeItem(key);
      }
    });
    console.log('All contest caches cleared');
  } catch (error) {
    console.error('Failed to clear all caches:', error);
  }
}

export function getCacheSize(): number {
  const storage = getStorage();
  if (!storage) return 0;

  try {
    let size = 0;
    const keys = Object.keys(storage);
    keys.forEach(key => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        const item = storage.getItem(key);
        if (item) {
          size += item.length;
        }
      }
    });
    return size;
  } catch (error) {
    return 0;
  }
}

export function getCacheInfo(): { contests: number; totalSize: number } {
  const storage = getStorage();
  if (!storage) return { contests: 0, totalSize: 0 };

  try {
    let contests = 0;
    let totalSize = 0;
    const keys = Object.keys(storage);
    keys.forEach(key => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        contests++;
        const item = storage.getItem(key);
        if (item) {
          totalSize += item.length;
        }
      }
    });
    return { contests, totalSize };
  } catch (error) {
    return { contests: 0, totalSize: 0 };
  }
}
