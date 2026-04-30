export interface Storage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export class FileStorage implements Storage {
  constructor(private basePath: string) {}

  async get(key: string): Promise<string | null> {
    return null;
  }

  async set(key: string, value: string): Promise<void> {
    // write to file
  }

  async delete(key: string): Promise<void> {
    // delete file
  }
}

export class RedisStorage implements Storage {
  constructor(private connectionUrl: string) {}

  async get(key: string): Promise<string | null> {
    return null;
  }

  async set(key: string, value: string): Promise<void> {
    // redis SET
  }

  async delete(key: string): Promise<void> {
    // redis DEL
  }
}
