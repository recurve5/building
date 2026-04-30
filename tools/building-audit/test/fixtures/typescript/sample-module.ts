import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import type { Config } from './types';

export interface Serializable {
  serialize(): string;
}

export interface Cacheable extends Serializable {
  getCacheKey(): string;
  invalidate(): void;
}

export class DataService implements Serializable, Cacheable {
  private data: Map<string, unknown>;

  constructor(private config: Config) {
    this.data = new Map();
  }

  serialize(): string {
    return JSON.stringify(Array.from(this.data.entries()));
  }

  getCacheKey(): string {
    return `data-${this.config.name}`;
  }

  invalidate(): void {
    this.data.clear();
  }

  async fetchData(url: string, retries: number = 3): Promise<unknown> {
    const response = await fetch(url);
    return response.json();
  }
}

export class EnhancedService extends DataService {
  override serialize(): string {
    return `enhanced:${super.serialize()}`;
  }
}

export function processItems(items: string[], filter: (item: string) => boolean): string[] {
  return items.filter(filter);
}

export async function* generateSequence(start: number, end: number): AsyncGenerator<number> {
  for (let i = start; i <= end; i++) {
    yield i;
  }
}

const helperFn = (x: number): number => x * 2;

export default function main(): void {
  console.log('hello');
}

export type Result = { ok: boolean; value: unknown };

export { helperFn };
