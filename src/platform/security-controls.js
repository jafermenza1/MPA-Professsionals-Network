import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { getPool, withTransaction } from "./db.js";

const sha256 = value => createHash("sha256").update(String(value)).digest("hex");
const normalizeAnswer = value => String(value ?? "").trim().replace(/\s+/g, "").toLowerCase();

export function clientAddress(req) {
  // Trust forwarded headers only when the deployment explicitly enables them.
  // The reverse proxy must overwrite X-Forwarded-For and direct API access must be blocked.
  if (process.env.TRUST_PROXY === "true") {
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",").map(x => x.trim()).filter(Boolean);
    if (forwarded.length) return forwarded[0].slice(0, 128);
  }
  return String(req.socket?.remoteAddress || "unknown").slice(0, 128);
}

export async function enforcePersistentRateLimit(req, action, limit = 10, windowMs = 60000, identity = "") {
  if (!Number.isInteger(limit) || limit < 1 || !Number.isFinite(windowMs) || windowMs < 1000) {
    throw new TypeError("Invalid rate-limit policy.");
  }
  const address = clientAddress(req);
  const keys = [sha256([action, address].join(":"))];
  if (identity) keys.push(sha256([action, address, String(identity).toLowerCase()].join(":")));
  const db = getPool();
  for (const key of keys) {
    const result = await db.query(`
      insert into security_rate_limit(bucket_key,window_started_at,request_count,expires_at)
      values($1,now(),1,now()+($2::bigint * interval '1 millisecond')+interval '10 minutes')
      on conflict(bucket_key) do update set
        window_started_at=case
          when security_rate_limit.window_started_at+($2::bigint * interval '1 millisecond') <= now() then now()
          else security_rate_limit.window_started_at end,
        request_count=case
          when security_rate_limit.window_started_at+($2::bigint * interval '1 millisecond') <= now() then 1
          else security_rate_limit.request_count+1 end,
        expires_at=now()+($2::bigint * interval '1 millisecond')+interval '10 minutes'
      returning request_count
    `, [key, windowMs]);
    if (Number(result.rows[0].request_count) > limit) {
      throw Object.assign(new Error("Too many requests. Please try again later."), { statusCode: 429, code: "RATE_LIMITED" });
    }
  }
  // Opportunistic bounded cleanup avoids a process-local map and keeps storage bounded.
  if (randomInt(0, 100) === 0) await db.query("delete from security_rate_limit where bucket_key in (select bucket_key from security_rate_limit where expires_at < now() order by expires_at limit 500)");
}

export async function issueHumanChallenge() {
  const a = randomInt(2, 10), b = randomInt(2, 10);
  const operation = randomInt(0, 2) ? "+" : "−";
  const answer = operation === "+" ? a + b : a - b;
  const question = `Confirm you are human: ${a} ${operation} ${b} = ?`;
  const row = (await getPool().query(
    "insert into security_human_challenge(purpose,question,answer_hash,expires_at) values('registration',$1,$2,now()+interval '5 minutes') returning id,question,expires_at",
    [question, sha256("registration:" + question + ":" + answer)]
  )).rows[0];
  if (randomInt(0, 100) === 0) await getPool().query("delete from security_human_challenge where id in (select id from security_human_challenge where expires_at < now() or consumed_at is not null order by expires_at limit 500)");
  return { id: row.id, question: row.question, expiresAt: row.expires_at };
}

export async function verifyHumanChallenge(id, answer) {
  const rawToken = randomBytes(32).toString("base64url");
  const result = await withTransaction(async db => {
    const row = (await db.query("select * from security_human_challenge where id=$1 and purpose='registration' for update", [id])).rows[0];
    if (!row || row.consumed_at || row.verified_at || new Date(row.expires_at) <= new Date() || row.failed_attempts >= 5) {
      return { ok: false, code: "CHALLENGE_INVALID" };
    }
    const suppliedAnswer = normalizeAnswer(answer);
    const actual = sha256("registration:" + row.question + ":" + suppliedAnswer);
    const expectedBytes = Buffer.from(row.answer_hash, "hex");
    const actualBytes = Buffer.from(actual, "hex");
    const match = /^-?\d{1,3}$/.test(suppliedAnswer) && expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
    if (!match) {
      await db.query("update security_human_challenge set failed_attempts=least(failed_attempts+1,5) where id=$1", [id]);
      return { ok: false, code: "CHALLENGE_INCORRECT" };
    }
    await db.query("update security_human_challenge set token_hash=$1,verified_at=now(),expires_at=now()+interval '5 minutes' where id=$2", [sha256(rawToken), id]);
    return { ok: true };
  });
  if (!result.ok) {
    const invalid = result.code === "CHALLENGE_INVALID";
    throw Object.assign(new Error(invalid ? "This human check has expired. Please try again." : "That answer was not correct. Please try again."), {
      statusCode: 400, code: result.code
    });
  }
  return { token: rawToken, expiresInSeconds: 300 };
}

export async function consumeHumanChallenge(db, rawToken) {
  if (typeof rawToken !== "string" || rawToken.length < 32 || rawToken.length > 256) {
    throw Object.assign(new Error("Complete the human check before registering."), { statusCode: 400, code: "CHALLENGE_REQUIRED" });
  }
  const result = await db.query(`
    update security_human_challenge set consumed_at=now()
    where token_hash=$1 and purpose='registration' and verified_at is not null
      and consumed_at is null and expires_at>now()
    returning id
  `, [sha256(rawToken)]);
  if (!result.rows[0]) {
    throw Object.assign(new Error("The human-check token is invalid, expired, or already used. Please complete the check again."), { statusCode: 400, code: "CHALLENGE_INVALID" });
  }
  return result.rows[0].id;
}

export const hashSecurityToken = sha256;
