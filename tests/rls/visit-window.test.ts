import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { dbPool } from "../helpers/local-stack";

let pool: Pool;
let ids: string[] = [];
const start = "2088-04-01T13:00:00Z", end = "2088-04-01T15:00:00Z";
beforeAll(async () => {
  pool = dbPool();
  for (let i=0;i<2;i++) {
    const r = await pool.query(`insert into bookings(business_id,property_id,member_id,tech_id,kind,status,deposit_required)
      values('b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001','7e000000-0000-4000-8000-000000000003','repair','confirmed',true) returning id`);
    ids.push(r.rows[0].id);
  }
  await pool.query("insert into payments(booking_id,status,amount_cents) values($1,'paid',7500)", [ids[0]]);
});
afterAll(async () => {
  if (ids.length) {
    await pool.query("delete from payments where booking_id=any($1::uuid[])", [ids]);
    await pool.query("delete from outbox where payload->>'booking_id'=any($1::text[])", [ids]);
    await pool.query("delete from booking_transitions where booking_id=any($1::uuid[])", [ids]);
    await pool.query("delete from bookings where id=any($1::uuid[])", [ids]);
  }
  await pool.end();
});
const assign = (id: string, a=start, b=end, actor="owner:telegram") => pool.query("select * from assign_visit_window($1,$2,$3,$4)", [id,a,b,actor]);
describe("atomic visit scheduling", () => {
  it("retains approval/payment and emits one attributed event; replay is a no-op", async () => {
    expect((await assign(ids[0])).rows[0].status).toBe("confirmed");
    await assign(ids[0]);
    const events = await pool.query("select payload from outbox where payload->>'booking_id'=$1 and topic='booking.visit_window_changed'", [ids[0]]);
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0].payload).toMatchObject({ actor:"owner:telegram", from_window:null });
    expect(events.rows[0].payload.to_window).toContain("13:00:00");
    expect((await pool.query("select status,amount_cents from payments where booking_id=$1", [ids[0]])).rows).toEqual([{status:"paid",amount_cents:7500}]);
    expect((await pool.query("select count(*)::int as n from booking_transitions where booking_id=$1", [ids[0]])).rows[0].n).toBe(1);
  });
  it("retains the double-booking constraint and rejects invalid windows/actors atomically", async () => {
    await expect(assign(ids[1])).rejects.toMatchObject({code:"23P01"});
    await expect(assign(ids[0],end,start)).rejects.toMatchObject({code:"22023"});
    await expect(assign(ids[0],start,end,"member")).rejects.toMatchObject({code:"P0001"});
    expect((await pool.query("select count(*)::int as n from outbox where payload->>'booking_id'=$1 and topic='booking.visit_window_changed'", [ids[1]])).rows[0].n).toBe(0);
  });
  it("emits another durable event when a visit is rescheduled", async () => {
    await assign(ids[0],"2088-04-02T13:00Z","2088-04-02T15:00Z");
    const rows=await pool.query("select payload,dedupe_key from outbox where payload->>'booking_id'=$1 and topic='booking.visit_window_changed' order by id",[ids[0]]);
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0].dedupe_key).not.toBe(rows.rows[1].dedupe_key);
    expect(rows.rows[1].payload.from_window).toBe(rows.rows[0].payload.to_window);
  });
  it("refuses assigning a time to a terminal booking", async () => {
    await pool.query("update bookings set status='completed' where id=$1",[ids[1]]);
    await expect(assign(ids[1],"2088-04-03T13:00Z","2088-04-03T15:00Z")).rejects.toMatchObject({code:"P0001"});
  });
  it.each(["anon","authenticated"])("denies scheduling RPC access to %s", async role => {
    const r=await pool.query("select has_function_privilege($1,'assign_visit_window(uuid,timestamptz,timestamptz,text)','EXECUTE') as allowed",[role]);
    expect(r.rows[0].allowed).toBe(false);
  });
});
