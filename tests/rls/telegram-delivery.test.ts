import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { dbPool } from "../helpers/local-stack";

let pool: Pool;
let id: number;
beforeAll(async () => {
  pool = dbPool();
  const r = await pool.query("insert into outbox(topic,dedupe_key,payload,airtable_delivered_at) values('booking.created',$1,'{}',now()) returning id", [`telegram-lease-test-${Date.now()}`]);
  id = Number(r.rows[0].id);
});
afterAll(async () => { await pool.query("delete from dead_letters where outbox_id=$1", [id]); await pool.query("delete from outbox where id=$1", [id]); await pool.end(); });

describe("Telegram delivery receipt boundary", () => {
  it("permits only one overlapping claim and guards completion with its token", async () => {
    const claims = await Promise.all(Array.from({ length: 4 }, () => pool.query("select claim_telegram_delivery($1) as token", [id])));
    const winners = claims.map(r => r.rows[0].token).filter(Boolean);
    expect(winners).toHaveLength(1);
    const bad = await pool.query("select complete_telegram_delivery($1,gen_random_uuid(),321) as ok", [id]);
    expect(bad.rows[0].ok).toBe(false);
    await pool.query("insert into dead_letters(outbox_id,workflow,error) values($1,'test','original failure')", [id]);
    const result = await pool.query("select complete_telegram_delivery($1,$2,321) as ok", [id, winners[0]]);
    expect(result.rows[0].ok).toBe(true);
    const receipt = (await pool.query("select * from outbox where id=$1", [id])).rows[0];
    expect(Number(receipt.telegram_message_id)).toBe(321);
    expect(receipt.processed_at).not.toBeNull();
    expect((await pool.query("select resolved_at,error from dead_letters where outbox_id=$1", [id])).rows[0]).toMatchObject({ error: "original failure", resolved_at: expect.any(Date) });
    expect((await pool.query("select claim_telegram_delivery($1) as token", [id])).rows[0].token).toBeNull();
  });

  it.each(["anon", "authenticated"])("does not grant receipt RPCs to %s", async role => {
    const r = await pool.query("select has_function_privilege($1,'claim_telegram_delivery(bigint)','EXECUTE') as claim, has_function_privilege($1,'complete_telegram_delivery(bigint,uuid,bigint)','EXECUTE') as complete", [role]);
    expect(r.rows[0]).toEqual({ claim: false, complete: false });
  });
});
