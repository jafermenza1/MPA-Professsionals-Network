import test from "node:test";
import assert from "node:assert/strict";
import { parseNotificationFilters, safeInternalUrl } from "../../src/platform/notifications.js";

test("notification filters enforce the supported category vocabulary and bounded pagination",()=>{
  assert.deepEqual(parseNotificationFilters({category:"mentorship",unreadOnly:"true",actionRequired:"true",limit:"500",offset:"-4"}),{
    category:"mentorship",limit:100,offset:0,unreadOnly:true,actionRequired:true
  });
  assert.equal(parseNotificationFilters({category:"all",limit:"0"}).limit,30);
  assert.throws(()=>parseNotificationFilters({category:"unknown"}),error=>error.statusCode===400&&error.code==="VALIDATION_ERROR");
});

test("notification deep links accept only safe same-origin relative paths",()=>{
  assert.equal(safeInternalUrl("/membership"),"/membership");
  assert.equal(safeInternalUrl("/jobs?tab=saved"),"/jobs?tab=saved");
  assert.equal(safeInternalUrl("https://example.org/phishing"),null);
  assert.equal(safeInternalUrl("//example.org/phishing"),null);
  assert.equal(safeInternalUrl("/\\\\example.org/phishing"),null);
  assert.equal(safeInternalUrl("javascript:alert(1)"),null);
  assert.equal(safeInternalUrl("/notifications\nattacker"),null);
});

test("action-center migration is additive and preserves notification history",async()=>{
  const {readFile}=await import("node:fs/promises");
  const migration=await readFile(new URL("../../db/migrations/20261015200000_in_app_action_center.sql",import.meta.url),"utf8");
  for(const field of ["category","title","body","priority","action_required","action_url","read_at","archived_at","dedupe_key"])assert.match(migration,new RegExp("ADD COLUMN IF NOT EXISTS "+field));
  assert.match(migration,/CREATE INDEX IF NOT EXISTS ix_notification_event_unread/);
  assert.match(migration,/CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_event_dedupe/);
  assert.doesNotMatch(migration,/DROP TABLE|TRUNCATE|DELETE FROM notification_event/i);
});
