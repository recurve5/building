import { describe, it, expect } from 'vitest';
import { add, multiply } from '../src/math';

describe('Math utils', () => {
  it('should add numbers correctly', () => {
    expect(add(2, 3)).toBe(5);
    expect(add(-1, 1)).toBe(0);
    expect(add(0, 0)).toStrictEqual(0);
  });

  it('should multiply numbers correctly', () => {
    expect(multiply(2, 3)).toEqual(6);
    expect(multiply(0, 100)).toBe(0);
  });

  test('should handle edge cases', () => {
    expect(() => multiply(Infinity, 0)).toThrow();
    expect(add(Number.MAX_SAFE_INTEGER, 1)).toBe(Number.MAX_SAFE_INTEGER + 1);
  });
});
