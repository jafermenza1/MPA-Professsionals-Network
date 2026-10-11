import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resolveMigrationBaseline, assertMigrationChecksum } from "../src/platform/migration-ledger.js";
import { fileURLToPath } from "node:url";

const url=process.env.DATABASE_URL;
if(!url){console.error("DATABASE_URL is required.");process.exit(1);}

const dir=fileURLToPath(new URL("../db/migrations/",import.meta.url));
const files=readdirSync(dir).filter(x=>x.endsWith(".sql")).sort();
const ledger="app_schema_migration";
const migrations=files.map(filename=>{
  const sql=readFileSync(join(dir,filename),"utf8");
  return {filename,sql,checksum:createHash("sha256").update(sql).digest("hex")};
});

function query(sql){
  return execFileSync("psql",[url,"-X","-A","-t","-q","-v","ON_ERROR_STOP=1","-c",sql],{encoding:"utf8"}).trim();
}
function execute(sql){
  execFileSync("psql",[url,"-X","-v","ON_ERROR_STOP=1","-1","-c",sql],{stdio:"inherit"});
}
function quote(value){return "'"+String(value).replace(/'/g,"''")+"'";}

execute(`create table if not exists ${ledger} (
  filename text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
)`);

const recordedCount=Number(query(`select count(*) from ${ledger}`));
const existingSchema=query(`select case when exists (select 1 from pg_tables where schemaname='public' and tablename <> ${quote(ledger)}) then 'yes' else 'no' end`)==="yes";

// The original repository did not track migration history. Never replay the full
// historical chain against an existing schema: older SQL may contain non-idempotent
// constraint changes. Require an explicit operator-confirmed baseline exactly once.
if(recordedCount===0 && existingSchema){
  const baseline=process.env.MIGRATION_BASELINE;
  const baselineFiles=resolveMigrationBaseline(files,baseline);
  const baselineRows=migrations.filter(m=>baselineFiles.includes(m.filename));
  const values=baselineRows.map(m=>`(${quote(m.filename)},${quote(m.checksum)})`).join(",");
  execute(`insert into ${ledger}(filename,checksum) values ${values} on conflict(filename) do nothing`);
  console.log("Recorded operator-confirmed legacy migration baseline through",baseline);
}

for(const migration of migrations){
  const {filename,sql,checksum}=migration;
  const existing=query(`select checksum from ${ledger} where filename=${quote(filename)}`);

  if(existing){
    assertMigrationChecksum(filename,existing,checksum);
    console.log("Already applied",filename);
    continue;
  }

  console.log("Applying",filename);
  // Execute the migration and its ledger write in one transaction. A failed migration
  // rolls back both schema changes and the history entry, so retries are safe.
  const record=`insert into ${ledger}(filename,checksum) values (${quote(filename)},${quote(checksum)})`;
  execute(`${sql}\n\n${record};`);
}
