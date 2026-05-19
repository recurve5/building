import { mkdirSync, writeFileSync } from 'fs';
import { join, basename } from 'path';

export function writeEvent(
  runDir: string,
  eventType: string,
  payload: Record<string, unknown>,
): void {
  const safe = basename(eventType);
  const eventsDir = join(runDir, 'events');
  mkdirSync(eventsDir, { recursive: true });
  const enriched = {
    event: eventType,
    timestamp: new Date().toISOString(),
    ...payload,
  };
  const filePath = join(eventsDir, `${safe}.json`);
  writeFileSync(filePath, JSON.stringify(enriched, null, 2) + '\n', 'utf-8');
}
