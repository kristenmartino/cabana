import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
const script=new AsyncFunction("input","base","fetch",readFileSync(new URL("../../ops/airtable/mark-missed.js",import.meta.url),"utf8"));
function setup(checked=true,reason="Gate locked.",response=new Response("ok")){
  const updateRecordAsync=vi.fn().mockResolvedValue(undefined);
  const record={id:"recQA",getCellValue:(name:string)=>name==="mark_missed"?checked:{id:"usrQA",name:"Office QA"},
    getCellValueAsString:(name:string)=>name==="booking_id"?"386a1414-0e62-4874-94fd-0dc0de8d3fbd":reason};
  const table={selectRecordAsync:vi.fn().mockResolvedValue(record),updateRecordAsync};
  const fetcher=vi.fn().mockResolvedValue(response);
  return {table,fetcher,run:()=>script({config:()=>({recordId:"recQA"}),secret:()=>"test-only"},{getTable:()=>table},fetcher)};
}
describe("Airtable Mark missed automation feedback",()=>{
  it("clears a definite rejection and leaves the reason available for correction",async()=>{
    const q=setup(true,"Gate locked.",new Response("Window has not ended.",{status:409}));
    await expect(q.run()).rejects.toThrow("Window has not ended.");
    expect(q.table.updateRecordAsync).toHaveBeenCalledWith("recQA",{mark_missed:false,missed_result:"Window has not ended."});
  });
  it("ignores the uncheck event, preventing a rejection loop",async()=>{
    const q=setup(false);await q.run();expect(q.fetcher).not.toHaveBeenCalled();expect(q.table.updateRecordAsync).not.toHaveBeenCalled();
  });
  it("requires a reason before submission",async()=>{
    const q=setup(true,"  ");await expect(q.run()).rejects.toThrow("reason");expect(q.fetcher).not.toHaveBeenCalled();
  });
  it("keeps an ambiguous delivery visible for operator review",async()=>{
    const q=setup(true,"Gate locked.",new Response("error",{status:500}));await expect(q.run()).rejects.toThrow("retained");
    expect(q.table.updateRecordAsync.mock.calls[0][1]).not.toHaveProperty("mark_missed");
    expect(q.table.updateRecordAsync.mock.calls[0][1].missed_result).toContain("Delivery not confirmed");
  });
  it("records success feedback and sends computed staff identity",async()=>{
    const q=setup();await q.run();expect(JSON.parse(q.fetcher.mock.calls[0][1].body)).toMatchObject({field:"mark_missed",staff_id:"usrQA",staff_name:"Office QA",reason:"Gate locked."});
    expect(q.table.updateRecordAsync.mock.calls[0][1].missed_result).toContain("Recorded as missed");
  });
});
