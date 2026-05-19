import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeEvent, _resetEventSeq } from '../../src/bridge/event-writer.js';
import { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function findEventFile(runDir: string, eventType: string): string {
  const eventsDir = join(runDir, 'events');
  const files = readdirSync(eventsDir);
  const match = files.find((f) => f.endsWith(`-${eventType}.json`));
  if (!match) throw new Error(`No event file found for ${eventType}`);
  return join(eventsDir, match);
}

function findAllEventFiles(runDir: string, eventType: string): string[] {
  const eventsDir = join(runDir, 'events');
  const files = readdirSync(eventsDir);
  return files.filter((f) => f.endsWith(`-${eventType}.json`)).map((f) => join(eventsDir, f));
}

describe('writeEvent', () => {
  let runDir: string;

  beforeEach(() => {
    runDir = mkdtempSync(join(tmpdir(), 'event-writer-test-'));
    _resetEventSeq();
  });

  afterEach(() => {
    rmSync(runDir, { recursive: true, force: true });
  });

  // EV-001: writeEvent writes valid JSON with timestamped filename
  it('EV-001: writes valid JSON to timestamped path', () => {
    writeEvent(runDir, 'test_event', { key: 'value' });
    const filePath = findEventFile(runDir, 'test_event');
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(parsed).toBeDefined();
    expect(parsed.key).toBe('value');
  });

  // EV-002: writeEvent creates events/ directory if missing
  it('EV-002: creates events/ directory if missing', () => {
    const eventsDir = join(runDir, 'events');
    expect(existsSync(eventsDir)).toBe(false);
    writeEvent(runDir, 'test_event', { key: 'value' });
    expect(existsSync(eventsDir)).toBe(true);
  });

  // EV-003: writeEvent enriches payload with event field
  it('EV-003: enriches payload with event field', () => {
    writeEvent(runDir, 'my_event', { data: 42 });
    const filePath = findEventFile(runDir, 'my_event');
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(parsed.event).toBe('my_event');
  });

  // EV-004: writeEvent enriches payload with timestamp field (ISO 8601)
  it('EV-004: enriches payload with ISO 8601 timestamp', () => {
    const before = new Date().toISOString();
    writeEvent(runDir, 'ts_event', { data: 1 });
    const after = new Date().toISOString();
    const filePath = findEventFile(runDir, 'ts_event');
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(parsed.timestamp).toBeDefined();
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    expect(parsed.timestamp >= before).toBe(true);
    expect(parsed.timestamp <= after).toBe(true);
  });

  // EV-005: writeEvent for session_boundary event type
  it('EV-005: writes session_boundary event', () => {
    writeEvent(runDir, 'session_boundary', { session_id: 'abc-123', reason: 'start' });
    const filePath = findEventFile(runDir, 'session_boundary');
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(parsed.event).toBe('session_boundary');
    expect(parsed.session_id).toBe('abc-123');
    expect(parsed.reason).toBe('start');
  });

  // EV-006: writeEvent for handoff_written event type
  it('EV-006: writes handoff_written event', () => {
    writeEvent(runDir, 'handoff_written', { handoff_path: '/tmp/handoff.md', milestone: 'm3' });
    const filePath = findEventFile(runDir, 'handoff_written');
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(parsed.event).toBe('handoff_written');
    expect(parsed.handoff_path).toBe('/tmp/handoff.md');
  });

  // EV-007: writeEvent for session_resumed event type
  it('EV-007: writes session_resumed event', () => {
    writeEvent(runDir, 'session_resumed', { previous_session: 'old-id', resumed_at: 'task-004' });
    const filePath = findEventFile(runDir, 'session_resumed');
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(parsed.event).toBe('session_resumed');
    expect(parsed.previous_session).toBe('old-id');
  });

  // BF-004: filename starts with timestamp and matches glob pattern
  it('BF-004: filename starts with timestamp, matches glob *-<eventType>.json', () => {
    writeEvent(runDir, 'session_boundary', { data: 1 });
    const files = readdirSync(join(runDir, 'events'));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^\d{8}T\d{9}Z-session_boundary\.json$/);
  });

  // BF-005: two writes with same type produce two distinct files
  it('BF-005: two writes with same type produce two distinct files', () => {
    writeEvent(runDir, 'overwrite_test', { version: 1 });
    writeEvent(runDir, 'overwrite_test', { version: 2 });
    const files = findAllEventFiles(runDir, 'overwrite_test');
    expect(files.length).toBeGreaterThanOrEqual(2);
    const contents = files.map((f) => JSON.parse(readFileSync(f, 'utf-8')));
    const versions = contents.map((c) => c.version);
    expect(versions).toContain(1);
    expect(versions).toContain(2);
  });

  // BF-006: filename timestamp matches JSON timestamp to millisecond
  it('BF-006: filename timestamp matches JSON payload timestamp', () => {
    writeEvent(runDir, 'ts_match', { data: 1 });
    const filePath = findEventFile(runDir, 'ts_match');
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    const filenameTs = filePath.split('/').pop()!.split('-ts_match')[0];
    const expectedTs = parsed.timestamp.replace(/[-:.]/g, '');
    expect(filenameTs).toBe(expectedTs);
  });
});
