import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { dbPool } from "../helpers/local-stack";
let pool:Pool;
const ids:string[]=[];
beforeAll(()=>{pool=dbPool();});
afterAll(async()=>{
  if(ids.length){
    await pool.query("delete from booking_missed_actions where booking_id=any($1::uuid[])",[ids]);
    await pool.query("delete from outbox where payload->>'booking_id'=any($1::text[])",[ids]);
    await pool.query("delete from booking_transitions where booking_id=any($1::uuid[])",[ids]);
    await pool.query("delete from bookings where id=any($1::uuid[])",[ids]);
  }
  await pool.end();
});
async function fixture(status="confirmed",window="[2020-01-01T13:00Z,2020-01-01T14:00Z)"){
  const r=await pool.query(`insert into bookings(business_id,property_id,member_id,kind,status,"window")
    values('b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001','plan_visit',$1,$2::tstzrange) returning id`,[status,window]);
  ids.push(r.rows[0].id);return r.rows[0].id as string;
}
const mark=(id:string,reason="Gate locked; no access.",staff="usrOffice")=>pool.query(
  "select * from mark_visit_missed($1,$2,'recQaVisit',$3,'QA Office')",[id,reason,staff]);
async function assertUnchanged(id:string,status:string){
  expect((await pool.query("select status from bookings where id=$1",[id])).rows[0].status).toBe(status);
  expect((await pool.query("select * from booking_missed_actions where booking_id=$1",[id])).rows).toHaveLength(0);
  expect((await pool.query("select * from outbox where payload->>'booking_id'=$1 and topic='booking.status_changed'",[id])).rows).toHaveLength(0);
}
describe("atomic office missed-visit action",()=>{
  it("stores reason/staff with an office audit and exactly one outbox event under concurrent replay",async()=>{
    const id=await fixture();await Promise.all([mark(id),mark(id)]);await mark(id);
    expect((await pool.query("select status from bookings where id=$1",[id])).rows[0].status).toBe("no_show");
    expect((await pool.query("select reason,staff_id,staff_name,airtable_record_id from booking_missed_actions where booking_id=$1",[id])).rows)
      .toEqual([{reason:"Gate locked; no access.",staff_id:"usrOffice",staff_name:"QA Office",airtable_record_id:"recQaVisit"}]);
    expect((await pool.query("select from_status,to_status,actor from booking_transitions where booking_id=$1 and from_status is not null",[id])).rows)
      .toEqual([{from_status:"confirmed",to_status:"no_show",actor:"office:airtable"}]);
    expect((await pool.query("select * from outbox where payload->>'booking_id'=$1 and topic='booking.status_changed'",[id])).rows).toHaveLength(1);
    await expect(mark(id,"Different reason.")).rejects.toMatchObject({code:"P0001",message:"missed_visit_already_recorded"});
    expect((await pool.query("select reason from booking_missed_actions where booking_id=$1",[id])).rows[0].reason).toBe("Gate locked; no access.");
  });
  it.each(["requested","scheduled","completed","cancelled","no_show"])("refuses %s visits",async status=>{
    const id=await fixture(status);await expect(mark(id)).rejects.toMatchObject({code:"P0001"});await assertUnchanged(id,status);
  });
  it.each([null,"empty","[2020-01-01T13:00Z,)","[,2020-01-01T14:00Z)","[-infinity,infinity)","[2088-01-01T13:00Z,2088-01-01T14:00Z)"])("refuses absent, unbounded or future windows: %s",async window=>{
    const id=await fixture("confirmed",window as string);await expect(mark(id)).rejects.toMatchObject({code:"P0001",message:"missed_visit_requires_elapsed_window"});
    await assertUnchanged(id,"confirmed");
  });
  it("requires a reason and collaborator even when called directly",async()=>{
    const id=await fixture();
    for(const reason of ["","   ","\n\t\r","x".repeat(1001)])await expect(mark(id,reason)).rejects.toMatchObject({code:"22023"});
    await expect(mark(id,"Gate locked.","automation")).rejects.toMatchObject({code:"22023"});
    await assertUnchanged(id,"confirmed");
  });
  it("serializes a conflicting completion without a partial audit",async()=>{
    const id=await fixture();const r=await Promise.allSettled([mark(id),pool.query("select transition_booking($1,'completed','office:airtable')",[id])]);
    expect(r.filter(x=>x.status==="fulfilled")).toHaveLength(1);
    expect((await pool.query("select * from outbox where payload->>'booking_id'=$1 and topic='booking.status_changed'",[id])).rows).toHaveLength(1);
    const status=(await pool.query("select status from bookings where id=$1",[id])).rows[0].status;
    expect((await pool.query("select * from booking_missed_actions where booking_id=$1",[id])).rows).toHaveLength(status==="no_show"?1:0);
  });
  it.each(["anon","authenticated"])("denies %s RPC and internal reason access",async role=>{
    const c=await pool.connect();try{
      await c.query("begin");await c.query(`set local role ${role}`);
      await expect(c.query("select mark_visit_missed(gen_random_uuid(),'reason','recQA','usrOffice','Office')")).rejects.toMatchObject({code:"42501"});
    } finally {await c.query("rollback");c.release();}
    const privileges=await pool.query("select has_table_privilege($1,'booking_missed_actions','SELECT') as readable",[role]);
    expect(privileges.rows[0].readable).toBe(false);
  });
});
