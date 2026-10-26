import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHandler, type Store } from "../../supabase/functions/airtable-writeback/handler";

const payload = { booking_id:"386a1414-0e62-4874-94fd-0dc0de8d3fbd", airtable_record_id:"recQaVisit",
  field:"mark_missed", value:true, reason:"Gate locked; no access during the visit window.", staff_id:"usrOffice", staff_name:"QA Office" };
let store: Store;
const request = (body: unknown = payload, secret = "test-secret") => new Request("https://example.invalid/writeback", {
  method:"POST", headers:{"x-writeback-secret":secret,"content-type":"application/json"}, body:JSON.stringify(body),
});
beforeEach(()=>{ store={complete:vi.fn().mockResolvedValue(null),notes:vi.fn().mockResolvedValue(true),missed:vi.fn().mockResolvedValue(null),log:vi.fn().mockResolvedValue(undefined)}; });
const handle=(req:Request)=>createHandler("test-secret",store)(req);
describe("fenced Airtable staff actions",()=>{
  it("rejects an unauthorized caller before accessing any record",async()=>{
    expect((await handle(request(payload,"wrong"))).status).toBe(403);
    expect(store.missed).not.toHaveBeenCalled();expect(store.log).not.toHaveBeenCalled();
    expect((await createHandler("",store)(request(payload,""))).status).toBe(403);
  });
  it.each([null,{}, {...payload,value:{}},{...payload,booking_id:"not-a-uuid"}])("rejects malformed payloads",async body=>{
    expect((await handle(request(body))).status).toBe(400);expect(store.missed).not.toHaveBeenCalled();
  });
  it("keeps raw status outside the whitelist",async()=>{
    expect((await handle(request({...payload,field:"status",value:"no_show"}))).status).toBe(422);
    expect(store.missed).not.toHaveBeenCalled();
  });
  it.each(["", "   ", "x".repeat(1001), null])("requires a bounded reason",async reason=>{
    expect((await handle(request({...payload,reason}))).status).toBe(422);expect(store.missed).not.toHaveBeenCalled();
  });
  it.each([{staff_id:""},{staff_name:""},{staff_id:"automation"}])("requires a captured staff collaborator",async fields=>{
    expect((await handle(request({...payload,...fields}))).status).toBe(422);expect(store.missed).not.toHaveBeenCalled();
  });
  it.each([false,"false",null])("unchecking cannot reopen a visit",async value=>{
    expect((await handle(request({...payload,value}))).status).toBe(200);expect(store.missed).not.toHaveBeenCalled();
  });
  it("passes the captured action to the guarded database RPC",async()=>{
    expect((await handle(request())).status).toBe(200);expect(store.missed).toHaveBeenCalledWith(payload);
    expect(store.log).toHaveBeenCalledWith(payload,expect.stringContaining("applied: mark_missed"));
  });
  it.each([
    ["P0001","missed_visit_requires_elapsed_window",409,"window ends"],
    ["P0001","missed_visit_requires_confirmed",409,"Only confirmed"],
    ["P0001","missed_visit_already_recorded",409,"original staff record"],
    ["P0002","booking not found",404,"not found"],
    ["22023","missed_reason_required",422,"reason"],
  ])("surfaces a guard rejection without reporting success",async(code,message,status,text)=>{
    vi.mocked(store.missed).mockResolvedValue({code,message});const r=await handle(request());
    expect(r.status).toBe(status);expect(await r.text()).toContain(text);
    expect(store.log).toHaveBeenCalledWith(payload,expect.stringContaining("rejected:"));
  });
  it("preserves completion and notes routing",async()=>{
    expect((await handle(request({...payload,field:"mark_completed"}))).status).toBe(200);
    expect(store.complete).toHaveBeenCalledWith(payload.booking_id);expect(store.missed).not.toHaveBeenCalled();
    expect((await handle(request({...payload,field:"visit_notes",value:"Pool cleaned."}))).status).toBe(200);
    expect(store.notes).toHaveBeenCalledWith(payload.booking_id,"Pool cleaned.");
  });
});
