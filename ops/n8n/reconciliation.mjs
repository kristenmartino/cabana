// Pure comparison code. scripts/build-reconciliation.mjs embeds this exact source
// in n8n; no network calls, mutations, credentials or staff-control inputs here.
export const FIELDS = [
  'status', 'kind', 'member_id', 'member_name', 'address', 'tech_name',
  'deposit_status', 'request_text', 'window_start', 'window_end', 'visit_notes',
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE = new Set(['member_name', 'address', 'tech_name', 'request_text', 'visit_notes', 'member_id']);
const ENUMS = {
  status: ['requested', 'needs_review', 'awaiting_deposit', 'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'],
  kind: ['plan_visit', 'one_off_clean', 'repair'],
  deposit_status: ['paid', 'pending', 'unpaid', 'n/a'],
};

function text(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('Expected text');
  return value.replace(/\r\n?/g, '\n');
}

function instant(value) {
  const valueText = text(value);
  if (valueText === null) return null;
  // Require an explicit offset; never let the n8n server's local timezone decide.
  if (!/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(?::\d\d(?:\.\d+)?)?(Z|[+-]\d\d(?::?\d\d)?)$/i.test(valueText)) throw new Error('Invalid timestamp');
  const iso = valueText.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00');
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new Error('Invalid timestamp');
  return new Date(ms).toISOString();
}

function normalize(field, value) {
  if (field.startsWith('window_')) return instant(value);
  const normalized = text(value);
  return field === 'member_id' && normalized !== null ? normalized.toLowerCase() : normalized;
}

export function projectBooking(booking) {
  if (!booking || !UUID.test(booking.id) || !UUID.test(booking.member_id)) throw new Error('Invalid app booking identity');
  const required = ['status', 'kind', 'request_text', 'window', 'visit_notes', 'deposit_required', 'members', 'properties', 'techs', 'payments'];
  if (required.some(key => !Object.hasOwn(booking, key)) || !Array.isArray(booking.payments) || typeof booking.deposit_required !== 'boolean') throw new Error('Incomplete app projection');
  if (!ENUMS.status.includes(booking.status) || !ENUMS.kind.includes(booking.kind)) throw new Error('Invalid app booking state');
  if (booking.payments.some(p => !['pending', 'paid', 'expired', 'refunded'].includes(p.status))) throw new Error('Invalid app payment state');
  for (const [relation, field] of [['members', 'full_name'], ['properties', 'address'], ['techs', 'display_name']]) {
    if (booking[relation] !== null && (typeof booking[relation] !== 'object' || Array.isArray(booking[relation]) || !Object.hasOwn(booking[relation], field))) throw new Error('Invalid app enrichment');
  }
  let bounds = [null, null];
  if (booking.window !== null) {
    const match = String(booking.window).match(/^[[(]"?([^",]+)"?,\s*"?([^"\])]+)"?[\])]$/);
    if (!match) throw new Error('Invalid app visit window');
    bounds = [instant(match[1]), instant(match[2])];
    if (bounds[0] >= bounds[1]) throw new Error('Invalid app visit window order');
  }
  const pays = booking.payments;
  const projected = {
    status: booking.status, kind: booking.kind, member_id: booking.member_id,
    member_name: booking.members?.full_name ?? null,
    address: booking.properties?.address ?? null,
    tech_name: booking.techs?.display_name ?? null,
    deposit_status: pays.some(p => p.status === 'paid') ? 'paid' : pays.some(p => p.status === 'pending') ? 'pending' : booking.deposit_required ? 'unpaid' : 'n/a',
    request_text: booking.request_text, window_start: bounds[0], window_end: bounds[1], visit_notes: booking.visit_notes,
  };
  return Object.fromEntries(FIELDS.map(field => [field, normalize(field, projected[field])]));
}

// Full-response HTTP nodes must finish pagination successfully. Missing/failed
// pages are errors, never interpreted as an empty database or a healthy scan.
export function readPages(items, source) {
  if (!Array.isArray(items) || items.length === 0) throw new Error(`Missing ${source} response`);
  let expectedCount;
  const rows = [];
  const offsets = new Set();
  for (let index = 0; index < items.length; index++) {
    const page = items[index].json;
    if (!page || page.statusCode < 200 || page.statusCode >= 300 || !Number.isInteger(page.statusCode)) throw new Error(`Failed ${source} response`);
    if (source === 'app') {
      if (!Array.isArray(page.body)) throw new Error('Invalid app response');
      const range = page.headers?.['content-range'] ?? page.headers?.['Content-Range'];
      const count = typeof range === 'string' && range.match(/^(?:\d+-\d+|\*)\/(\d+)$/);
      if (!count) throw new Error('Missing app exact count');
      const total = Number(count[1]);
      if (expectedCount !== undefined && total !== expectedCount) throw new Error('App changed during pagination; retry scan');
      expectedCount = total;
      if (index < items.length - 1 && page.body.length !== 1000) throw new Error('Incomplete app page');
      if (index === items.length - 1 && page.body.length >= 1000) throw new Error('Unfinished app pagination');
      rows.push(...page.body);
    } else if (source === 'airtable') {
      if (!page.body || !Array.isArray(page.body.records)) throw new Error('Invalid Airtable response');
      const offset = page.body.offset;
      if (offset !== undefined && (typeof offset !== 'string' || !offset || offsets.has(offset))) throw new Error('Invalid Airtable pagination');
      if ((index === items.length - 1) !== (offset === undefined)) throw new Error('Incomplete Airtable pagination');
      if (offset) offsets.add(offset);
      rows.push(...page.body.records);
    } else throw new Error('Unknown response source');
  }
  if (source === 'app' && rows.length !== expectedCount) throw new Error('App row count does not match exact count');
  return rows;
}

function appIndex(rows) {
  if (!Array.isArray(rows)) throw new Error('Missing app snapshot');
  const result = new Map();
  for (const booking of rows) {
    const projection = projectBooking(booking);
    const id = booking.id.toLowerCase();
    if (result.has(id)) throw new Error('Duplicate app booking; retry scan');
    result.set(id, projection);
  }
  return result;
}

function safeValue(field, value) {
  if (PRIVATE.has(field)) return '[contents omitted]';
  if (value === null) return '(blank)';
  if (field.startsWith('window_') || ENUMS[field]?.includes(value)) return value;
  return '[invalid value]';
}

export function reconcile(beforeRows, airtableRows, afterRows, checkedAt = new Date().toISOString()) {
  const before = appIndex(beforeRows);
  const after = appIndex(afterRows);
  if (!Array.isArray(airtableRows)) throw new Error('Missing Airtable snapshot');
  const deferred = new Set([...before.keys(), ...after.keys()].filter(id => JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id))));
  const issues = [];
  const index = new Map();
  const recordIds = new Set();
  for (const row of airtableRows) {
    if (!row || typeof row.id !== 'string' || !/^rec[a-z0-9]+$/i.test(row.id) || !row.fields || typeof row.fields !== 'object' || Array.isArray(row.fields) || recordIds.has(row.id)) throw new Error('Invalid or repeated Airtable record; retry scan');
    recordIds.add(row.id);
    const id = row.fields.booking_id;
    if (typeof id !== 'string' || !UUID.test(id)) {
      issues.push({ type: 'invalid_booking_id', record_ids: [row.id] });
      continue;
    }
    const key = id.toLowerCase();
    index.set(key, [...(index.get(key) ?? []), row]);
  }
  let compared = 0;
  for (const id of [...new Set([...after.keys(), ...index.keys()])].sort()) {
    if (deferred.has(id)) continue;
    const expected = after.get(id);
    const records = index.get(id) ?? [];
    if (!expected) {
      issues.push({ type: 'unexpected_booking', booking_id: id, record_ids: records.map(r => r.id) });
    } else if (records.length === 0) {
      issues.push({ type: 'missing_booking', booking_id: id, record_ids: [] });
    } else {
      if (records.length > 1) issues.push({ type: 'duplicate_booking', booking_id: id, record_ids: records.map(r => r.id) });
      compared++;
      for (const record of records) {
        for (const field of FIELDS) {
          let actual;
          try { actual = normalize(field, record.fields[field]); } catch { actual = '[invalid value]'; }
          if (actual !== expected[field]) issues.push({ type: 'field_mismatch', booking_id: id, record_ids: [record.id], field, expected: safeValue(field, expected[field]), actual: safeValue(field, actual) });
        }
      }
    }
  }
  const counts = Object.fromEntries(['field_mismatch', 'missing_booking', 'unexpected_booking', 'duplicate_booking', 'invalid_booking_id'].map(type => [type, issues.filter(i => i.type === type).length]));
  const result = { checked_at: checkedAt, status: deferred.size ? 'incomplete' : issues.length ? 'drift' : 'matched', app_count: after.size, airtable_count: airtableRows.length, compared_bookings: compared, deferred_booking_ids: [...deferred].sort(), issue_count: issues.length, counts, issues, text: '' };
  result.text = formatReport(result);
  return result;
}

export function formatReport(result) {
  const lines = [
    `${result.status === 'matched' ? '✅' : '⚠️'} Cabana reconciliation: ${result.status === 'matched' ? 'all compared fields match' : result.status === 'incomplete' ? 'incomplete scan' : 'booking drift detected'}.`,
    `${result.app_count} app bookings; ${result.airtable_count} Airtable records; ${result.compared_bookings} bookings compared across ${FIELDS.length} fields.`,
    `${result.counts.field_mismatch} field mismatches; ${result.counts.missing_booking} missing; ${result.counts.unexpected_booking} unexpected; ${result.counts.duplicate_booking} duplicate IDs; ${result.counts.invalid_booking_id} invalid IDs.`,
    `Checked ${result.checked_at}. Read-only; no records changed.`,
  ];
  if (result.deferred_booking_ids.length) lines.push(`${result.deferred_booking_ids.length} bookings changed during the scan and were deferred. Run again.`);
  let shown = 0;
  for (const issue of result.issues) {
    const line = issue.type === 'field_mismatch'
      ? `${issue.booking_id} / ${issue.record_ids[0]}: ${issue.field}${PRIVATE.has(issue.field) ? ' differs (contents omitted)' : ` — app ${issue.expected}; Airtable ${issue.actual}`}`
      : `${issue.booking_id ?? '(no valid booking ID)'}: ${issue.type}; records ${issue.record_ids.join(', ') || '(none)'}`;
    if (shown >= 20 || lines.join('\n').length + line.length > 3650) break;
    lines.push(line);
    shown++;
  }
  if (shown < result.issues.length) lines.push(`${result.issues.length - shown} more issues; see the reconciliation execution output in n8n.`);
  return lines.join('\n');
}
