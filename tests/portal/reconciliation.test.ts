import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { FIELDS, projectBooking, readPages, reconcile } from '../../ops/n8n/reconciliation.mjs';

const id = 'accbbb83-5a83-4a83-b1b9-f748d22577dd';
const booking = {
  id, member_id: '10221029-51ca-484d-8c1d-b0102846346d', status: 'confirmed', kind: 'repair',
  request_text: 'Synthetic request\nsecond line', visit_notes: 'Synthetic note', deposit_required: true,
  window: '["2026-10-26 13:00:00+00","2026-10-26 14:00:00+00")',
  members: { full_name: 'QA Member' }, properties: { address: 'Fictional QA pool' }, techs: null,
  payments: [{ status: 'paid' }],
};
function record(value: Omit<typeof booking, 'visit_notes' | 'window'> & { visit_notes: string | null; window: string | null } = booking, recordId = 'recSynthetic'): { id: string; fields: Record<string, string | null | undefined> } {
  return { id: recordId, fields: { booking_id: value.id, ...projectBooking(value) } };
}
const appPage = (body: unknown[], total = body.length) => ({ json: { statusCode: 200, headers: { 'content-range': `${body.length ? `0-${body.length - 1}` : '*'}/${total}` }, body } });
const airPage = (records: unknown[], offset?: string) => ({ json: { statusCode: 200, body: { records, ...(offset ? { offset } : {}) } } });

describe('booking field reconciliation', () => {
  it('detects every projected field with identical booking counts', () => {
    for (const field of FIELDS) {
      const row = record();
      row.fields[field] = field.startsWith('window_') ? '2026-10-26T15:00:00Z' : 'changed';
      const result = reconcile([booking], [row], [booking]);
      expect(result.app_count).toBe(result.airtable_count);
      expect(result.status).toBe('drift');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toMatchObject({ booking_id: id, type: 'field_mismatch', field });
    }
  });

  it('matches by UUID rather than order, normalizes blanks, line endings and equivalent instants', () => {
    const row = record();
    row.fields.window_start = '2026-10-26T09:00:00-04:00';
    row.fields.window_end = '2026-10-26T14:00:00.000Z';
    row.fields.request_text = 'Synthetic request\r\nsecond line';
    delete row.fields.tech_name;
    row.fields.booking_id = id.toUpperCase();
    row.fields.member_id = booking.member_id.toUpperCase();
    const second = { ...booking, id: '10000000-0000-4000-8000-000000000001', visit_notes: null };
    const secondRow = record(second, 'recSecond');
    secondRow.fields.visit_notes = '';
    expect(reconcile([booking, second], [secondRow, row], [second, booking]).status).toBe('matched');
    row.fields.window_start = '2026-10-26T09:00:00-05:00';
    expect(reconcile([booking], [row], [booking]).issues[0].field).toBe('window_start');
  });

  it('preserves meaningful whitespace and rejects invalid timezone-free Airtable timestamps', () => {
    const row = record();
    row.fields.visit_notes += ' ';
    row.fields.window_start = '2026-10-26T09:00:00';
    const result = reconcile([booking], [row], [booking]);
    expect(result.issues.map(i => i.field)).toEqual(['window_start', 'visit_notes']);
    expect(result.issues[0].actual).toBe('[invalid value]');
  });

  it('reports missing, unexpected, duplicate and invalid IDs even with equal row counts', () => {
    const extra = { ...booking, id: '10000000-0000-4000-8000-000000000001' };
    const rows = [record(extra)];
    expect(reconcile([booking], rows, [booking]).counts).toMatchObject({ missing_booking: 1, unexpected_booking: 1 });
    const duplicate = reconcile([booking], [record(), record(booking, 'recDuplicate')], [booking]);
    expect(duplicate.counts.duplicate_booking).toBe(1);
    const invalid = record();
    invalid.fields.booking_id = 'private malformed value';
    const result = reconcile([booking], [invalid], [booking]);
    expect(result.counts.invalid_booking_id).toBe(1);
    expect(JSON.stringify(result)).not.toContain('private malformed value');
  });

  it('defers changed, inserted and removed app bookings instead of reporting false drift or success', () => {
    const result = reconcile([booking], [record()], [{ ...booking, status: 'completed' }]);
    expect(result).toMatchObject({ status: 'incomplete', issue_count: 0, deferred_booking_ids: [id] });
    expect(result.text).not.toContain('all compared fields match');
    expect(reconcile([], [], [booking]).deferred_booking_ids).toEqual([id]);
    expect(reconcile([booking], [record()], []).deferred_booking_ids).toEqual([id]);
  });

  it('does not compare staff controls or delivery timestamps', () => {
    const row = { ...record(), fields: { ...record().fields, last_synced: 'stale', mark_completed: true, mark_missed: true, missed_reason: 'private' } };
    expect(reconcile([booking], [row], [booking]).status).toBe('matched');
  });

  it('keeps private contents out of structured and Telegram reports and bounds message size', () => {
    const rows = Array.from({ length: 50 }, (_, i) => {
      const row = record(booking, `recSynthetic${i}`);
      row.fields.visit_notes = 'PRIVATE CHANGED NOTE';
      row.fields.member_name = 'PRIVATE CHANGED NAME';
      return row;
    });
    const result = reconcile([booking], rows, [booking]);
    const serialized = JSON.stringify(result);
    for (const privateText of ['PRIVATE CHANGED', 'Synthetic note', 'QA Member', 'Fictional QA pool']) expect(serialized).not.toContain(privateText);
    expect(result.text.length).toBeLessThan(4000);
    expect(result.text).toContain('more issues');
    expect(result.issue_count).toBe(101);
  });

  it('fails closed for malformed app and Airtable source data', () => {
    expect(() => reconcile([{ ...booking, payments: null }], [], [booking])).toThrow();
    expect(() => reconcile([{ ...booking, window: 'empty' }], [], [booking])).toThrow();
    expect(() => reconcile([{ ...booking, members: {} }], [], [booking])).toThrow();
    expect(() => reconcile([booking, booking], [], [booking])).toThrow();
    expect(() => reconcile([booking], [record(), record()], [booking])).toThrow();
    expect(() => reconcile([booking], [{ id: 'not-a-record' }], [booking])).toThrow();
  });

  it('uses the delivery projection contract for state, payment and window fields', () => {
    const consumer = JSON.parse(readFileSync(new URL('../../ops/n8n/workflows/outbox-consumer.json', import.meta.url), 'utf8'));
    const run = new Function('$', '$json', '$env', consumer.nodes.find((n: { name: string }) => n.name === 'Build actions').parameters.jsCode);
    for (const source of [booking, { ...booking, status: 'cancelled', window: null, payments: [], deposit_required: false }, { ...booking, payments: [{ status: 'pending' }] }, { ...booking, payments: [] }]) {
      const delivery = run(() => ({ item: { json: { id: 1, payload: { booking_id: id } } } }), source, { OWNER_CHAT_ID: '0' }).json.airtable_records[0].fields;
      const row = { id: 'recProjection', fields: { ...delivery, visit_notes: source.visit_notes } };
      expect(reconcile([source], [row], [source]).status).toBe('matched');
    }
  });
});

describe('complete source pagination and deployed code', () => {
  it('reads >1000 app rows and >100 Airtable records, including exact-page boundary', () => {
    expect(readPages([appPage(Array(1000).fill(booking), 1001), appPage([booking], 1001)], 'app')).toHaveLength(1001);
    expect(readPages([appPage(Array(1000).fill(booking), 1000), appPage([], 1000)], 'app')).toHaveLength(1000);
    expect(readPages([airPage(Array(100).fill(record()), 'next'), airPage([record()])], 'airtable')).toHaveLength(101);
    expect(readPages([appPage([])], 'app')).toEqual([]);
  });

  it('refuses failed, malformed, partial, repeated and changing page sets', () => {
    for (const items of [[], [{ json: { statusCode: 401, body: [] } }], [{ json: { statusCode: 200, body: [] } }], [appPage(Array(1000).fill(booking))], [appPage([booking], 2)], [appPage(Array(1000).fill(booking), 1001), appPage([], 1000)]]) expect(() => readPages(items, 'app')).toThrow();
    for (const items of [[airPage([], 'next')], [airPage([], 'same'), airPage([], 'same'), airPage([])], [airPage([]), airPage([])], [{ json: { statusCode: 200, body: { error: 'unauthorized' } } }]]) expect(() => readPages(items, 'airtable')).toThrow();
  });

  it('executes exactly the generated n8n source and preserves fail-closed, paginated, single-run nodes', () => {
    execFileSync(process.execPath, ['scripts/build-reconciliation.mjs', '--check']);
    const workflow = JSON.parse(readFileSync(new URL('../../ops/n8n/workflows/reconciliation.json', import.meta.url), 'utf8'));
    const run = new Function('$', workflow.nodes.find((n: { name: string }) => n.name === 'Compare booking fields').parameters.jsCode);
    const row = record(); row.fields.status = 'cancelled';
    const result = run((name: string) => ({ all: () => name === 'Read Airtable bookings' ? [airPage([row])] : [appPage([booking])] }))[0].json;
    expect(result.counts.field_mismatch).toBe(1);
    expect(result.text).toContain('app confirmed; Airtable cancelled');
    for (const node of workflow.nodes.filter((n: { name: string }) => n.name.startsWith('Read '))) {
      expect(node.executeOnce).toBe(true);
      expect(node.parameters.options.response.response.neverError).not.toBe(true);
      expect(node.parameters.options.pagination.pagination.limitPagesFetched).toBe(false);
      expect(node.parameters.method).toBe('GET');
    }
    expect(workflow.settings.timezone).toBe('America/New_York');
  });
});

describe('explicit QA history retention', () => {
  const annotation = 'Archived 2026-10-26T22:00:00.000Z | Historical demo booking absent from the app; retain original QA evidence.';
  const historyBooking = { ...booking, id: '20000000-0000-4000-8000-000000000001' };
  const history = (): ReturnType<typeof record> => ({ ...record(historyBooking, 'recHistory'), fields: { ...record(historyBooking).fields, qa_history: annotation } });

  it('retains explicitly archived rows separately and reports current counts truthfully', () => {
    const result = reconcile([booking], [record(), history()], [booking]);
    expect(result).toMatchObject({ status: 'matched', app_count: 1, airtable_count: 2, active_airtable_count: 1, history_record_count: 1, history_record_ids: ['recHistory'], compared_bookings: 1, issue_count: 0 });
    expect(result.text).toContain('1 app bookings; 1 current Airtable records');
    expect(result.text).toContain('1 historical QA records retained separately (2 Airtable records total)');
    expect(result.text).not.toContain(annotation);
  });

  it('cannot hide a current booking or any of its field mismatches by marking it as history', () => {
    const row = record(); row.fields.qa_history = annotation; row.fields.status = 'cancelled';
    const result = reconcile([booking], [row], [booking]);
    expect(result.status).toBe('drift');
    expect(result.counts).toMatchObject({ history_conflict: 1, field_mismatch: 1 });
    expect(result.history_record_count).toBe(0);
    expect(result.compared_bookings).toBe(1);
  });

  it('never automatically archives an unmatched record or accepts an undated/malformed label', () => {
    for (const value of [undefined, '', 'QA', 'Archived 2026-02-31T22:00:00.000Z | Invalid calendar date cannot archive this record.']) {
      const row = history(); row.fields.qa_history = value;
      const result = reconcile([], [row], []);
      expect(result.status).toBe('drift');
      expect(result.counts.unexpected_booking).toBe(1);
      expect(result.history_record_count).toBe(0);
      if (value) expect(result.counts.invalid_history).toBe(1);
    }
  });

  it('still reports duplicate IDs and invalid identities within retained history', () => {
    const first = history(), second = { ...history(), id: 'recHistoryDuplicate' };
    expect(reconcile([], [first, second], []).counts.duplicate_booking).toBe(1);
    first.fields.booking_id = 'not a UUID';
    const invalid = reconcile([], [first], []);
    expect(invalid.counts.invalid_booking_id).toBe(1);
    expect(invalid.history_record_count).toBe(0);
  });

  it('does not archive away a booking removed or added during the scan', () => {
    const row = history();
    const removed = reconcile([historyBooking], [row], []);
    expect(removed.status).toBe('incomplete');
    expect(removed.counts.history_conflict).toBe(1);
    expect(removed.history_record_count).toBe(0);
    const added = reconcile([], [row], [historyBooking]);
    expect(added.status).toBe('incomplete');
    expect(added.history_record_count).toBe(0);
  });
});
