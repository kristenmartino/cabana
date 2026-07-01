-- seed.sql — the demo world (applied automatically by `supabase db reset`)
-- Fictional data only: Sailfish Pool Care, Jupiter FL. No real PII anywhere.
-- Fixed UUIDs so tests and docs can reference rows by name.
-- Dates are relative to now() so the seed stays evergreen.

select set_config('cabana.actor', 'seed', false);

-- Business ------------------------------------------------------------------
insert into businesses (id, name, tz) values
  ('b1000000-0000-4000-8000-000000000001', 'Sailfish Pool Care', 'America/New_York');

-- Service area (D3): non-member intake accepted in these zips only.
insert into service_zips (zip, note) values
  ('33458', 'Jupiter'),
  ('33469', 'Tequesta'),
  ('33477', 'Jupiter inlet / beach'),
  ('33478', 'Jupiter Farms');

-- Plans (billing lives in QuickBooks — NG1; weekly_day powers self-service) --
insert into plans (id, name, weekly_day) values
  ('91000000-0000-4000-8000-000000000001', 'Weekly Essential',  2),  -- Tuesdays
  ('91000000-0000-4000-8000-000000000002', 'Weekly Plus',       3),  -- Wednesdays
  ('91000000-0000-4000-8000-000000000003', 'Weekly Premium',    4);  -- Thursdays

-- Techs -----------------------------------------------------------------------
insert into techs (id, business_id, display_name) values
  ('7e000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Marcus'),
  ('7e000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'Jenna'),
  ('7e000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001', 'Ray');

-- Members (user_id stays null until first magic-link sign-in) ----------------
insert into members (id, business_id, full_name, email, phone) values
  ('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Ken Alvarez',     'ken.alvarez@example.com',    '561-555-0101'),
  ('a1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'Priya Nair',      'priya.nair@example.com',     '561-555-0102'),
  ('a1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001', 'Tom Whitcomb',    'tom.whitcomb@example.com',   '561-555-0103'),
  ('a1000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000001', 'Rosa Delgado',    'rosa.delgado@example.com',   '561-555-0104'),
  ('a1000000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-000000000001', 'Steve Okafor',    'steve.okafor@example.com',   '561-555-0105'),
  ('a1000000-0000-4000-8000-000000000006', 'b1000000-0000-4000-8000-000000000001', 'Meredith Chan',   'meredith.chan@example.com',  '561-555-0106');

insert into properties (id, member_id, address, zip, access_notes) values
  ('c1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', '118 Pelican Way, Jupiter FL',      '33458', 'Gate 4482. Dog (friendly lab, name is Biscuit).'),
  ('c1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', '9 Compass Ct, Tequesta FL',        '33469', 'Side gate unlocked Thursdays only.'),
  ('c1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003', '400 Lighthouse Dr, Jupiter FL',    '33477', null),
  ('c1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000004', '77 Cypress Trail, Jupiter FL',     '33478', 'Gate 1199. No pets.'),
  ('c1000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000005', '23 Sandpiper Ln, Jupiter FL',      '33458', 'Pool equipment behind hedge, left side.'),
  ('c1000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000006', '5 Inlet View Rd, Jupiter FL',      '33477', 'Doorbell first; work-from-home.');

insert into memberships (member_id, property_id, plan_id) values
  ('a1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000003'),
  ('a1000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000002'),
  ('a1000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000005', 'c1000000-0000-4000-8000-000000000005', '91000000-0000-4000-8000-000000000002'),
  ('a1000000-0000-4000-8000-000000000006', 'c1000000-0000-4000-8000-000000000006', '91000000-0000-4000-8000-000000000003');

-- Bookings: one in every state the UI, bot, and Airtable views must handle. --
-- Direct inserts at target statuses are legal (the transition guard governs
-- UPDATEs; the insert trigger records from_status = null). Each insert also
-- emits a booking.created outbox row — useful raw material for Day-2 wiring.

-- 1) requested — brand new, pre-triage
insert into bookings (id, business_id, property_id, member_id, kind, status, request_text)
values ('d1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
        'c1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003',
        'repair', 'requested',
        'Pump is making a grinding noise and the water is starting to turn green. Can someone come this week?');

-- 2) needs_review — low-confidence triage routed to a human (D8)
insert into bookings (id, business_id, property_id, member_id, kind, status, request_text, triage)
values ('d1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001',
        'c1000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000006',
        'repair', 'needs_review',
        'water looks weird',
        '{
          "service_type": "repair",
          "urgency": "medium",
          "summary": "Unspecified water quality issue; details insufficient to qualify.",
          "equipment": [],
          "symptoms": ["water appearance"],
          "access_flags": [],
          "in_service_area": true,
          "confidence": 0.42,
          "member_ack_draft": "Thanks for reaching out — got your note about the water. Dana will text you shortly to get a couple of details so we send the right tech with the right parts."
        }'::jsonb);

-- 3) awaiting_deposit — qualified repair, hold pending payment (R4)
insert into bookings (id, business_id, property_id, member_id, tech_id, kind, status, request_text, deposit_required, "window")
values ('d1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001',
        'c1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
        '7e000000-0000-4000-8000-000000000001',
        'repair', 'awaiting_deposit',
        'Heater will not ignite. Pentair MasterTemp, error code and everything. Gate code on file.',
        true,
        tstzrange(date_trunc('hour', now()) + interval '3 days',
                  date_trunc('hour', now()) + interval '3 days 1 hour'));

insert into payments (id, booking_id, amount_cents, status)
values ('e1000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000003', 7500, 'pending');

-- 4) scheduled — deposit paid, on the calendar
insert into bookings (id, business_id, property_id, member_id, tech_id, kind, status, request_text, deposit_required, "window")
values ('d1000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000001',
        'c1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000004',
        '7e000000-0000-4000-8000-000000000002',
        'repair', 'scheduled',
        'Timer box door fell off and the light circuit trips the breaker.',
        true,
        tstzrange(date_trunc('hour', now()) + interval '2 days',
                  date_trunc('hour', now()) + interval '2 days 2 hours'));

insert into payments (id, booking_id, amount_cents, status)
values ('e1000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000004', 7500, 'paid');

-- 5) confirmed — Dana approved from Telegram; plan visit for tomorrow
insert into bookings (id, business_id, property_id, member_id, tech_id, kind, status, "window")
values ('d1000000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-000000000001',
        'c1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002',
        '7e000000-0000-4000-8000-000000000003',
        'plan_visit', 'confirmed',
        tstzrange(date_trunc('hour', now()) + interval '1 day',
                  date_trunc('hour', now()) + interval '1 day 45 minutes'));

-- 6) completed — with office visit notes (the Airtable write-back field, R6)
insert into bookings (id, business_id, property_id, member_id, tech_id, kind, status, "window", visit_notes)
values ('d1000000-0000-4000-8000-000000000006', 'b1000000-0000-4000-8000-000000000001',
        'c1000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000005',
        '7e000000-0000-4000-8000-000000000001',
        'one_off_clean', 'completed',
        tstzrange(date_trunc('hour', now()) - interval '3 days',
                  date_trunc('hour', now()) - interval '3 days' + interval '90 minutes'),
        'Heavy leaf load after storm; recommended monthly filter rinse add-on.');

-- 7) cancelled — deposit hold expired (system:expiry path, R4)
insert into bookings (id, business_id, property_id, member_id, kind, status, request_text, deposit_required)
values ('d1000000-0000-4000-8000-000000000007', 'b1000000-0000-4000-8000-000000000001',
        'c1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003',
        'repair', 'cancelled',
        'Skimmer lid cracked, needs replacement.',
        true);

insert into payments (id, booking_id, amount_cents, status)
values ('e1000000-0000-4000-8000-000000000007', 'd1000000-0000-4000-8000-000000000007', 7500, 'expired');

-- 8) no_show — the expensive failure Cabana exists to reduce (D6)
insert into bookings (id, business_id, property_id, member_id, tech_id, kind, status, "window")
values ('d1000000-0000-4000-8000-000000000008', 'b1000000-0000-4000-8000-000000000001',
        'c1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
        '7e000000-0000-4000-8000-000000000002',
        'plan_visit', 'no_show',
        tstzrange(date_trunc('hour', now()) - interval '7 days',
                  date_trunc('hour', now()) - interval '7 days' + interval '45 minutes'));

-- Telegram allowlist: requires REAL chat ids — populate on Day 1 after
-- messaging the bot once and reading the chat id from the update payload:
-- insert into telegram_chats (chat_id, label, role) values
--   (123456789, 'Dana (owner)',  'owner'),
--   (987654321, 'Marie (office)','office');
