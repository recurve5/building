export interface Logger {
  log(message: string): void;
  error(message: string, error?: Error): void;
}

export class ConsoleLogger implements Logger {
  log(message: string): void {
    console.log(message);
  }

  error(message: string, error?: Error): void {
    console.error(message, error);
  }
}
