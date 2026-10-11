import crypto from "node:crypto";
function timingSafeEqualText(a,b){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb)}
function b64url(v){return Buffer.from(v).toString("base64url")}
export function signToken(payload,secret,now=Math.floor(Date.now()/1000)){const h=b64url(JSON.stringify({alg:"HS256",typ:"JWT"}));const b=b64url(JSON.stringify({...payload,iat:payload.iat??now}));const i=h+"."+b;return i+"."+crypto.createHmac("sha256",secret).update(i).digest("base64url")}
export function verifyToken(token,secret,now=Math.floor(Date.now()/1000)){if(!token||!secret)throw new Error("Authentication unavailable.");const p=token.split(".");if(p.length!==3)throw new Error("Invalid bearer token.");const e=crypto.createHmac("sha256",secret).update(p[0]+"."+p[1]).digest("base64url");if(!timingSafeEqualText(p[2],e))throw new Error("Invalid bearer token.");let payload;try{payload=JSON.parse(Buffer.from(p[1],"base64url").toString("utf8"))}catch{throw new Error("Invalid bearer token.")}if(payload.exp!==undefined&&Number(payload.exp)<=now)throw Object.assign(new Error("Bearer token expired."),{statusCode:401});if(!payload.sub)throw new Error("Bearer token subject missing.");return payload}
export function requireRole(identity,role){const roles=Array.isArray(identity?.roles)?identity.roles:[];if(!roles.includes(role)){const e=new Error("Forbidden.");e.statusCode=403;throw e}return identity}
export function newSessionToken(){return crypto.randomBytes(48).toString("base64url")}
export function sessionTokenPayload(user,roles,sessionId,now=Math.floor(Date.now()/1000)){return {sub:user.id,roles,email:user.email||null,sid:sessionId,iat:now,exp:now+Number(process.env.AUTH_SESSION_DAYS||7)*86400}}
export function hashSessionToken(token){return crypto.createHash("sha256").update(token).digest("hex")}

// Replace signed-token role claims with the roles currently read from the database.
export function withCurrentRoles(identity,databaseRoles){return {...identity,roles:Array.isArray(databaseRoles)?databaseRoles:[]}}
