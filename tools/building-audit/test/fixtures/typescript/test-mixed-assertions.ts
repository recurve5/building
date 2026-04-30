import { describe, it, expect } from 'vitest';
import { processData } from '../src/processor';

describe('Processor', () => {
  it('should transform data correctly', () => {
    const result = processData({ input: 'hello' });
    expect(result).toBeDefined();
    expect(result.output).toBe('HELLO');
    expect(result.length).toEqual(5);
  });

  it('should handle null values', () => {
    const result = processData(null);
    expect(result).toBeTruthy();
    expect(result.error).toMatchObject({ code: 'NULL_INPUT' });
  });
});
