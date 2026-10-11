import test from "node:test";
import assert from "node:assert/strict";
import { validatePrivateUploadName, validatePrivateUploadBytes, MAX_PRIVATE_UPLOAD_BYTES } from "../../src/platform/private-file-storage.js";

test("private upload names are reduced to a safe basename",()=>{
  assert.equal(validatePrivateUploadName("../../evidence.pdf"),"evidence.pdf");
  assert.equal(validatePrivateUploadName("folder\\\\evidence.pdf"),"evidence.pdf");
  assert.throws(()=>validatePrivateUploadName(""),{code:"INVALID_FILE"});
  assert.throws(()=>validatePrivateUploadName("bad\nname.pdf"),{code:"INVALID_FILE"});
});

test("private upload enforces bounded size and allowlisted content type",()=>{
  assert.equal(MAX_PRIVATE_UPLOAD_BYTES,10*1024*1024);
  assert.throws(()=>validatePrivateUploadBytes("application/x-msdownload",Buffer.from("MZ")),{code:"UNSUPPORTED_FILE_TYPE"});
  assert.throws(()=>validatePrivateUploadBytes("application/pdf",Buffer.from("not a pdf")),{code:"FILE_TYPE_MISMATCH"});
  assert.throws(()=>validatePrivateUploadBytes("image/png",Buffer.from("not png")),{code:"FILE_TYPE_MISMATCH"});
  assert.throws(()=>validatePrivateUploadBytes("image/jpeg",Buffer.from("not jpeg")),{code:"FILE_TYPE_MISMATCH"});
  assert.throws(()=>validatePrivateUploadBytes("text/plain",Buffer.from([65,0,66])),{code:"FILE_TYPE_MISMATCH"});
});

test("private upload validates signatures for PDF and images",()=>{
  assert.doesNotThrow(()=>validatePrivateUploadBytes("application/pdf",Buffer.from("%PDF-1.7\\nprivate evidence")));
  assert.doesNotThrow(()=>validatePrivateUploadBytes("image/png",Buffer.from([137,80,78,71,13,10,26,10,0])));
  assert.doesNotThrow(()=>validatePrivateUploadBytes("image/jpeg",Buffer.from([255,216,255,0])));
});
