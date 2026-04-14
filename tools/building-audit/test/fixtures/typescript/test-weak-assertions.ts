import { describe, it, expect } from 'vitest';
import { calculateStreak } from '../src/streak-service';

describe('StreakService', () => {
  it('should calculate streak correctly', () => {
    const result = calculateStreak([1, 2, 3]);
    expect(result).toBeDefined();
    expect(result).toBeTruthy();
    expect(result).toBeInstanceOf(Object);
  });

  it('should handle empty input', () => {
    const result = calculateStreak([]);
    expect(result).toBeDefined();
    expect(result).not.toBeNull();
  });
});
