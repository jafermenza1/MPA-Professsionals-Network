import pg from "pg";
import { loadConfig } from "./config.js";

const {Pool}=pg;
let pool;

export function getPool(){
  if(!pool) {
    const config=loadConfig();
    if(!config.databaseUrl) throw new Error("DATABASE_URL is required for database operations.");
    pool=new Pool({connectionString:config.databaseUrl,max:Number(process.env.DB_POOL_MAX||10),idleTimeoutMillis:30000});
  }
  return pool;
}

export async function withTransaction(work){
  const client=await getPool().connect();
  try {
    await client.query("begin");
    const result=await work(client);
    await client.query("commit");
    return result;
  } catch(error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(){
  if(pool){ await pool.end(); pool=null; }
}
