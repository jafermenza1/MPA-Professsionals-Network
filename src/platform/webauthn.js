import crypto from "node:crypto";
import { getPool, withTransaction } from "./db.js";
import { loadConfig } from "./config.js";
import { signToken, newSessionToken, hashSessionToken, sessionTokenPayload } from "./auth.js";

const b64url = value => Buffer.from(value).toString("base64url");
const fromB64url = value => {
  if (typeof value !== "string" || value.length > 16384 || !/^[A-Za-z0-9_-]*$/.test(value)) throw new Error("Invalid WebAuthn encoding.");
  return Buffer.from(value, "base64url");
};
const sha256 = value => crypto.createHash("sha256").update(value).digest();
const hashText = value => sha256(Buffer.from(String(value))).toString("hex");
function fail(status, message, code) { throw Object.assign(new Error(message), { statusCode: status, code }); }
function constantEqual(a,b) { const aa=Buffer.from(a),bb=Buffer.from(b); return aa.length===bb.length && crypto.timingSafeEqual(aa,bb); }

function relyingParty() {
  const production = loadConfig().nodeEnv === "production";
  const configuredOrigin = String(process.env.WEBAUTHN_ORIGIN || (production ? "" : "http://localhost:3001")).trim();
  const configuredRpId = String(process.env.WEBAUTHN_RP_ID || "").trim();
  if (!configuredOrigin || (production && !configuredRpId)) fail(503,"Administrator passkey authentication is not configured.","PASSKEY_NOT_CONFIGURED");
  let parsed;
  try { parsed = new URL(configuredOrigin); } catch { fail(503,"WEBAUTHN_ORIGIN is invalid.","PASSKEY_NOT_CONFIGURED"); }
  if (production && parsed.protocol !== "https:") fail(503,"Production passkeys require an HTTPS origin.","PASSKEY_NOT_CONFIGURED");
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) fail(503,"WEBAUTHN_ORIGIN must be an origin without a path, query, or fragment.","PASSKEY_NOT_CONFIGURED");
  const rpId = configuredRpId || parsed.hostname;
  if (parsed.hostname !== rpId && !parsed.hostname.endsWith("." + rpId)) fail(503,"WEBAUTHN_RP_ID does not match WEBAUTHN_ORIGIN.","PASSKEY_NOT_CONFIGURED");
  return { origin: parsed.origin, rpId, rpName: "MPA Professionals Network" };
}

// Minimal bounded CBOR decoder for the WebAuthn attestation structures accepted here.
// This implementation deliberately accepts only "none" attestation and ES256/P-256 keys.
function decodeCbor(buffer, offset=0, depth=0) {
  if (depth > 24 || offset >= buffer.length) throw new Error("Malformed WebAuthn CBOR.");
  const initial=buffer[offset++], major=initial>>5, ai=initial&31;
  let length;
  if (ai < 24) length=ai;
  else if (ai===24) { if(offset+1>buffer.length)throw new Error("Malformed CBOR."); length=buffer[offset++]; }
  else if (ai===25) { if(offset+2>buffer.length)throw new Error("Malformed CBOR."); length=buffer.readUInt16BE(offset);offset+=2; }
  else if (ai===26) { if(offset+4>buffer.length)throw new Error("Malformed CBOR."); length=buffer.readUInt32BE(offset);offset+=4; }
  else if (ai===27) { if(offset+8>buffer.length)throw new Error("Malformed CBOR."); const n=buffer.readBigUInt64BE(offset);offset+=8;if(n>BigInt(Number.MAX_SAFE_INTEGER))throw new Error("CBOR value too large.");length=Number(n); }
  else if (ai===31) throw new Error("Indefinite CBOR is not accepted.");
  else throw new Error("Unsupported CBOR length.");
  if (major===0) return {value:length,offset};
  if (major===1) return {value:-1-length,offset};
  if (major===2 || major===3) {
    if(length>65536 || offset+length>buffer.length)throw new Error("CBOR string exceeds bounds.");
    const bytes=buffer.subarray(offset,offset+length);
    return {value:major===2?Buffer.from(bytes):bytes.toString("utf8"),offset:offset+length};
  }
  if (major===4) {
    if(length>256)throw new Error("CBOR array exceeds bounds.");
    const value=[];for(let i=0;i<length;i++){const item=decodeCbor(buffer,offset,depth+1);value.push(item.value);offset=item.offset;}
    return {value,offset};
  }
  if (major===5) {
    if(length>256)throw new Error("CBOR map exceeds bounds.");
    const value=new Map();for(let i=0;i<length;i++){const key=decodeCbor(buffer,offset,depth+1);const item=decodeCbor(buffer,key.offset,depth+1);value.set(key.value,item.value);offset=item.offset;}
    return {value,offset};
  }
  if (major===7) {
    if(ai===20)return {value:false,offset};if(ai===21)return {value:true,offset};if(ai===22)return {value:null,offset};
  }
  throw new Error("Unsupported CBOR value.");
}
function clientData(encoded, expectedType, challenge, origin) {
  const bytes=fromB64url(encoded);
  if(bytes.length>8192)throw new Error("WebAuthn client data exceeds bounds.");
  let data;try{data=JSON.parse(bytes.toString("utf8"));}catch{throw new Error("Malformed WebAuthn client data.");}
  if(data.type!==expectedType || data.challenge!==challenge || data.origin!==origin || data.crossOrigin===true) throw new Error("WebAuthn origin or challenge validation failed.");
  return bytes;
}
function assertAuthenticatorData(authData,rpId,requireAttested=false) {
  if(!Buffer.isBuffer(authData)||authData.length<37)throw new Error("Authenticator data is malformed.");
  const expected=sha256(Buffer.from(rpId));
  if(!constantEqual(authData.subarray(0,32),expected))throw new Error("WebAuthn relying-party hash mismatch.");
  const flags=authData[32];
  if((flags&0x01)===0 || (flags&0x04)===0)throw new Error("Passkey user presence and user verification are required.");
  const signCount=authData.readUInt32BE(33);
  if(requireAttested && (flags&0x40)===0)throw new Error("Passkey attested credential data is missing.");
  return {flags,signCount};
}
function parseAttestation(encoded,rpId,expectedCredentialId) {
  const bytes=fromB64url(encoded);
  if(bytes.length>65536)throw new Error("Passkey attestation exceeds bounds.");
  const decoded=decodeCbor(bytes);
  if(decoded.offset!==bytes.length || !(decoded.value instanceof Map))throw new Error("Malformed passkey attestation.");
  const attestation=decoded.value;
  if(attestation.get("fmt")!=="none")throw new Error("Only privacy-preserving none attestation is accepted.");
  const statement=attestation.get("attStmt");
  if(!(statement instanceof Map)||statement.size!==0)throw new Error("Unexpected attestation statement.");
  const authData=attestation.get("authData");
  const auth=assertAuthenticatorData(authData,rpId,true);
  let offset=37+16;
  if(offset+2>authData.length)throw new Error("Credential data is malformed.");
  const idLength=authData.readUInt16BE(offset);offset+=2;
  if(idLength<1||idLength>1024||offset+idLength>=authData.length)throw new Error("Credential ID is invalid.");
  const credentialId=authData.subarray(offset,offset+idLength);offset+=idLength;
  if(!constantEqual(credentialId,expectedCredentialId))throw new Error("Credential ID mismatch.");
  const cose=decodeCbor(authData,offset);
  if(!(cose.value instanceof Map))throw new Error("Unsupported passkey public key.");
  const key=cose.value;
  if(key.get(1)!==2 || key.get(3)!==-7 || key.get(-1)!==1 || !Buffer.isBuffer(key.get(-2)) || !Buffer.isBuffer(key.get(-3))) throw new Error("Only ES256 P-256 passkeys are accepted.");
  const x=key.get(-2),y=key.get(-3);
  if(x.length!==32||y.length!==32)throw new Error("Passkey public key coordinates are invalid.");
  const jwk={kty:"EC",crv:"P-256",x:b64url(x),y:b64url(y),ext:true};
  // Validate that Node can parse the key before persisting it.
  crypto.createPublicKey({key:jwk,format:"jwk"});
  return {credentialId:b64url(credentialId),publicKeyJwk:jwk,signCount:auth.signCount};
}
async function adminUser(db,userId) {
  const row=(await db.query(`select u.id,u.email,u.username,u.status,u.admin_passkey_enforced_at,
    coalesce(array_agg(distinct r.role_code) filter(where r.role_code is not null),'{}') roles
    from app_user u left join app_user_role ur on ur.user_id=u.id left join app_role r on r.id=ur.role_id
    where u.id=$1 group by u.id`,[userId])).rows[0];
  if(!row||row.status!=="active"||!row.roles.some(role=>["system_admin","admin"].includes(role)))fail(403,"Administrator access is required.","FORBIDDEN");
  return row;
}
async function sessionToken(db,user,authMethod,requestMeta={}) {
  const raw=newSessionToken(),ttl=Number(process.env.AUTH_SESSION_DAYS||7);
  const session=(await db.query("insert into auth_session(user_id,token_hash,expires_at,ip_address,user_agent,auth_method) values($1,$2,now()+make_interval(days=>$3),$4,$5,$6) returning id",[user.id,hashSessionToken(raw),ttl,requestMeta.ip||null,requestMeta.userAgent||null,authMethod])).rows[0];
  const roles=(await db.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[user.id])).rows.map(x=>x.role_code);
  return {token:signToken(sessionTokenPayload(user,roles,session.id),loadConfig().jwtSecret),user:{id:user.id,email:user.email,roles}};
}

export async function beginAdminPasskeyRegistration(identity) {
  const config=relyingParty(),db=getPool(),user=await adminUser(db,identity.sub);
  const session=(await db.query("select created_at,auth_method from auth_session where id=$1 and user_id=$2 and revoked_at is null and expires_at>now()",[identity.sid,identity.sub])).rows[0];
  if(!session || (Date.now()-new Date(session.created_at).getTime()>10*60*1000 && session.auth_method!=="recovery"))fail(401,"Sign in again before registering a passkey.","RECENT_AUTH_REQUIRED");
  if(session.auth_method==="recovery" && !user.admin_passkey_enforced_at)fail(403,"Recovery session is invalid.","FORBIDDEN");
  const challenge=b64url(crypto.randomBytes(32));
  await db.query("insert into admin_passkey_challenge(user_id,purpose,challenge,expires_at,metadata) values($1,'register',$2,now()+interval '5 minutes',$3)",[user.id,challenge,{authMethod:session.auth_method,sessionId:identity.sid}]);
  const existing=await db.query("select credential_id,transports from admin_passkey_credential where user_id=$1 and revoked_at is null",[user.id]);
  return {publicKey:{challenge,rp:{id:config.rpId,name:config.rpName},user:{id:b64url(Buffer.from(user.id)),name:user.email,displayName:user.username||user.email},pubKeyCredParams:[{type:"public-key",alg:-7}],timeout:60000,attestation:"none",authenticatorSelection:{residentKey:"preferred",userVerification:"required"},excludeCredentials:existing.rows.map(x=>({type:"public-key",id:x.credential_id,transports:x.transports}))}};
}

export async function finishAdminPasskeyRegistration(identity,payload,requestId) {
  const config=relyingParty(),db=getPool(),user=await adminUser(db,identity.sub);
  const row=(await db.query(`
    update admin_passkey_challenge set consumed_at=now()
    where id=(select id from admin_passkey_challenge
      where user_id=$1 and purpose='register' and consumed_at is null and expires_at>now()
        and metadata->>'sessionId'=$2
      order by created_at desc limit 1)
    returning id,challenge,metadata
  `,[user.id,identity.sid])).rows[0];
  if(!row)fail(400,"Passkey registration challenge expired, was already used, or belongs to another session. Start again.","PASSKEY_CHALLENGE_INVALID");
  try {
    const response=payload?.response;
    if(!payload?.id||payload.id!==payload.rawId||!response?.clientDataJSON||!response?.attestationObject)fail(400,"Passkey registration response is incomplete.","PASSKEY_RESPONSE_INVALID");
    clientData(response.clientDataJSON,"webauthn.create",row.challenge,config.origin);
    const credential=parseAttestation(response.attestationObject,config.rpId,fromB64url(payload.rawId));
    return await withTransaction(async tx=>{
      await tx.query("insert into admin_passkey_credential(user_id,credential_id,public_key_jwk,sign_count,transports,display_name) values($1,$2,$3,$4,$5,$6)",[user.id,credential.credentialId,credential.publicKeyJwk,credential.signCount,Array.isArray(response.transports)?response.transports:[],String(payload.displayName||"Administrator passkey").slice(0,80)]);
      await tx.query("update app_user set admin_passkey_enforced_at=coalesce(admin_passkey_enforced_at,now()),updated_at=now() where id=$1",[user.id]);
      await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'admin.passkey.registered','admin_passkey_credential',$2,$3,'success',$4)",[user.id,credential.credentialId,requestId||null,{algorithm:"ES256",userVerification:true}]);
      await tx.query("update admin_passkey_recovery_code set consumed_at=coalesce(consumed_at,now()) where user_id=$1 and consumed_at is null",[user.id]);
      const recoveryCodes=Array.from({length:8},()=>crypto.randomBytes(8).toString("hex").toUpperCase());
      for(const code of recoveryCodes)await tx.query("insert into admin_passkey_recovery_code(user_id,code_hash) values($1,$2)",[user.id,hashText(code)]);
      return {registered:true,recoveryCodes,warning:"Save these recovery codes now. Each code can be used once to create a restricted session for registering a replacement passkey. They will not be shown again."};
    });
  } catch(error) {
    if(error.statusCode)throw error;
    fail(400,"Passkey registration could not be verified. Start again and use a supported device or browser.","PASSKEY_ATTESTATION_INVALID");
  }
}

export async function beginAdminPasskeyAuthentication(emailInput) {
  const config=relyingParty(),email=String(emailInput||"").trim().toLowerCase(),db=getPool();
  if(!email||email.length>320)fail(400,"Enter your administrator email address.","VALIDATION_ERROR");
  const user=(await db.query("select id,email,status,admin_passkey_enforced_at from app_user where lower(email)=lower($1)",[email])).rows[0];
  if(!user||user.status!=="active"||!user.admin_passkey_enforced_at)fail(401,"No usable administrator passkey was found. Check the email or use the documented recovery process.","PASSKEY_NOT_AVAILABLE");
  const roles=(await db.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[user.id])).rows.map(x=>x.role_code);
  if(!roles.some(role=>["system_admin","admin"].includes(role)))fail(401,"No usable administrator passkey was found.","PASSKEY_NOT_AVAILABLE");
  const credentials=(await db.query("select credential_id,transports from admin_passkey_credential where user_id=$1 and revoked_at is null",[user.id])).rows;
  if(!credentials.length)fail(401,"No active administrator passkey is available. Use a recovery code.","PASSKEY_NOT_AVAILABLE");
  const challenge=b64url(crypto.randomBytes(32));
  await db.query("insert into admin_passkey_challenge(user_id,purpose,challenge,expires_at) values($1,'authenticate',$2,now()+interval '5 minutes')",[user.id,challenge]);
  return {email:user.email,publicKey:{challenge,rpId:config.rpId,timeout:60000,userVerification:"required",allowCredentials:credentials.map(x=>({type:"public-key",id:x.credential_id,transports:x.transports}))}};
}

export async function finishAdminPasskeyAuthentication(emailInput,payload,requestMeta={},requestId) {
  const config=relyingParty(),email=String(emailInput||"").trim().toLowerCase(),db=getPool();
  const user=(await db.query("select id,email,username,status,admin_passkey_enforced_at from app_user where lower(email)=lower($1)",[email])).rows[0];
  if(!user||user.status!=="active"||!user.admin_passkey_enforced_at)fail(401,"Passkey authentication failed.","UNAUTHENTICATED");
  const challenge=(await db.query(`
    update admin_passkey_challenge set consumed_at=now()
    where id=(select id from admin_passkey_challenge
      where user_id=$1 and purpose='authenticate' and consumed_at is null and expires_at>now()
      order by created_at desc limit 1)
    returning id,challenge
  `,[user.id])).rows[0];
  if(!challenge)fail(401,"Passkey authentication challenge is invalid, expired, or already used.","UNAUTHENTICATED");
  const response=payload?.response;
  if(!payload?.id||payload.id!==payload.rawId||!response?.clientDataJSON||!response?.authenticatorData||!response?.signature)fail(400,"Passkey response is incomplete.","PASSKEY_RESPONSE_INVALID");
  try {
    return await withTransaction(async tx=>{
      const credential=(await tx.query("select * from admin_passkey_credential where user_id=$1 and credential_id=$2 and revoked_at is null for update",[user.id,payload.rawId])).rows[0];
      if(!credential)fail(401,"Passkey authentication failed.","UNAUTHENTICATED");
      const clientBytes=clientData(response.clientDataJSON,"webauthn.get",challenge.challenge,config.origin);
      const authData=fromB64url(response.authenticatorData);
      const parsed=assertAuthenticatorData(authData,config.rpId,false);
      const signed=Buffer.concat([authData,sha256(clientBytes)]);
      const publicKey=crypto.createPublicKey({key:credential.public_key_jwk,format:"jwk"});
      if(!crypto.verify("sha256",signed,publicKey,fromB64url(response.signature)))fail(401,"Passkey signature is invalid.","UNAUTHENTICATED");
      const previous=Number(credential.sign_count||0);
      if(previous>0 && (parsed.signCount===0 || parsed.signCount<=previous))fail(401,"Passkey counter indicates a replayed or cloned credential.","PASSKEY_COUNTER_INVALID");
      const update=await tx.query("update admin_passkey_credential set sign_count=$1,last_used_at=now() where id=$2 and revoked_at is null and (sign_count=0 or $1=0 or sign_count<$1) returning id",[parsed.signCount,credential.id]);
      if(!update.rows[0])fail(401,"Passkey counter changed during authentication. Try again.","PASSKEY_COUNTER_INVALID");
      await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'admin.passkey.authenticated','admin_passkey_credential',$2,$3,'success',$4)",[user.id,credential.id,requestId||null,{userVerification:true}]);
      return sessionToken(tx,user,"passkey",requestMeta);
    });
  } catch(error) {
    if(error.statusCode)throw error;
    fail(401,"Passkey authentication failed.","UNAUTHENTICATED");
  }
}

export async function recoverAdminPasskey(emailInput,codeInput,requestMeta={},requestId) {
  const email=String(emailInput||"").trim().toLowerCase(),code=String(codeInput||"").trim().toUpperCase(),db=getPool();
  if(!email||!code||code.length>64)fail(401,"Recovery could not be completed.","RECOVERY_INVALID");
  return withTransaction(async tx=>{
    const user=(await tx.query("select id,email,username,status,admin_passkey_enforced_at from app_user where lower(email)=lower($1) for update",[email])).rows[0];
    if(!user||user.status!=="active"||!user.admin_passkey_enforced_at)fail(401,"Recovery could not be completed.","RECOVERY_INVALID");
    const roles=(await tx.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[user.id])).rows.map(x=>x.role_code);
    if(!roles.some(role=>["system_admin","admin"].includes(role)))fail(401,"Recovery could not be completed.","RECOVERY_INVALID");
    const recovery=(await tx.query("select id from admin_passkey_recovery_code where user_id=$1 and code_hash=$2 and consumed_at is null for update",[user.id,hashText(code)])).rows[0];
    if(!recovery)fail(401,"Recovery could not be completed.","RECOVERY_INVALID");
    await tx.query("update admin_passkey_recovery_code set consumed_at=now() where id=$1",[recovery.id]);
    await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'admin.passkey.recovery_started','account',$2,$3,'success',$4)",[user.id,user.id,requestId||null,{method:"single_use_recovery_code"}]);
    return sessionToken(tx,user,"recovery",requestMeta);
  });
}

export async function listAdminPasskeys(userId) {
  return (await getPool().query("select id,display_name,created_at,last_used_at,transports from admin_passkey_credential where user_id=$1 and revoked_at is null order by created_at desc",[userId])).rows;
}
export async function revokeAdminPasskey(userId,credentialId,requestId) {
  return withTransaction(async tx=>{
    const active=await tx.query("select id from admin_passkey_credential where user_id=$1 and revoked_at is null for update",[userId]);
    const target=active.rows.find(row=>row.id===credentialId);
    if(!target)fail(404,"Passkey not found.","NOT_FOUND");
    const user=(await tx.query("select admin_passkey_enforced_at from app_user where id=$1 for update",[userId])).rows[0];
    if(user?.admin_passkey_enforced_at && active.rows.length<=1)fail(409,"Register a second passkey before revoking the last active passkey. If all passkeys are lost, use a recovery code.","LAST_PASSKEY_REQUIRED");
    await tx.query("update admin_passkey_credential set revoked_at=now() where id=$1",[credentialId]);
    await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'admin.passkey.revoked','admin_passkey_credential',$2,$3,'success',$4)",[userId,credentialId,requestId||null,{}]);
    return {revoked:true};
  });
}
