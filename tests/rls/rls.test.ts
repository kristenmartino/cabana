// tests/rls/rls.test.ts
// The security boundary is the database, so the security tests talk to the
// database — three clients, three privilege levels, adversarial assertions
// (R1/R8, 0005_rls.sql). Runs against the local Supabase stack:
//   supabase start && supabase db reset && npm run test:rls
//
// STATUS: Day-4 skeleton. The fixture pattern is final; it.todo entries are
// the checklist. Implementation note: create two auth users via the local
// service role (auth.admin.createUser), link them to members a1...01 (Ken)
// and a1...02 (Priya) by setting members.user_id, then build clients whose
// JWTs are those users. Seed UUIDs are stable — reference them directly.

import { describe, it } from "vitest";

describe("RLS: member isolation (three-fixture adversarial suite)", () => {
  // Fixture A: member Ken   (a1000000-...-000000000001)
  // Fixture B: member Priya (a1000000-...-000000000002)
  // Fixture C: service role (bypasses RLS — the control)

  it.todo("A reads own member row; B's row is invisible to A");
  it.todo("A reads own properties/bookings/payments; B's are invisible (select returns 0 rows, not an error)");
  it.todo("A cannot read B's payments through the bookings join path");
  it.todo("A cannot select from service-role-only tables: outbox, stripe_events, ai_events, dead_letters, telegram_chats, sync_log, booking_transitions");
  it.todo("A cannot insert/update/delete bookings or payments (write lockdown)");
  it.todo("A can update access_notes on OWN property; stamp trigger records A's uid + timestamp");
  it.todo("A cannot update access_notes on B's property");
  it.todo("A cannot update any properties column other than access_notes (column grant)");
  it.todo("anon (signed out) reads nothing from any table");
  it.todo("service role reads/writes everything (control fixture)");
});

describe("Booking invariants (via service role)", () => {
  it.todo("double-booking race: two concurrent 'scheduled' inserts for same tech+window — exactly one succeeds, loser gets exclusion violation");
  it.todo("illegal transition completed -> scheduled raises P0001");
  it.todo("legal transition writes booking_transitions row with actor from set_actor()");
  it.todo("status change emits exactly one outbox row; replaying the same transition is a no-op (dedupe_key)");
  it.todo("DST boundary: booking window across the Nov 2026 fall-back renders correctly in America/New_York");
});
