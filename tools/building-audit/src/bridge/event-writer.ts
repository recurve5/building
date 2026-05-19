import { mkdirSync, writeFileSync } from 'fs';
import { join, basename } from 'path';

let lastTs = '';
let seq = 0;

export function _resetEventSeq(): void {
  lastTs = '';
  seq = 0;
}

export function writeEvent(
  runDir: string,
  eventType: string,
  payload: Record<string, unknown>,
): void {
  const safe = basename(eventType);
  const now = new Date();
  const ts = now.toISOString().replace(/[-:.]/g, '');
  if (ts === lastTs) {
    seq++;
  } else {
    lastTs = ts;
    seq = 0;
  }
  const eventsDir = join(runDir, 'events');
  mkdirSync(eventsDir, { recursive: true });
  const enriched = {
    event: eventType,
    timestamp: now.toISOString(),
    ...payload,
  };
  const suffix = seq > 0 ? `-${seq}` : '';
  const filePath = join(eventsDir, `${ts}${suffix}-${safe}.json`);
  writeFileSync(filePath, JSON.stringify(enriched, null, 2) + '\n', 'utf-8');
}
