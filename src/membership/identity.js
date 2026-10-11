import crypto from "node:crypto";

export function normalizeEmail(value){
  return typeof value==="string" ? value.trim().toLowerCase() : null;
}

export function normalizePhone(value){
  if(!value) return null;
  let digits=String(value).replace(/[^0-9+]/g,"");
  if(digits.startsWith("+")) digits=digits.slice(1);
  if(digits.startsWith("00251")) digits=digits.slice(2);
  if(digits.startsWith("251")) return "+"+digits;
  if(/^0[79][0-9]{8}$/.test(digits)) return "+251"+digits.slice(1);
  return digits ? "+"+digits : null;
}

export function normalizeName(value){
  return String(value||"").trim().toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu," ").replace(/\s+/g," ").trim();
}

export function validatePassword(password){
  if(typeof password!=="string" || password.length<10){
    const error=new Error("Use a password with at least 10 characters.");
    error.statusCode=400;
    error.code="PASSWORD_TOO_SHORT";
    throw error;
  }
  return password;
}

export function hashPassword(password){
  validatePassword(password);
  const salt=crypto.randomBytes(16);
  const hash=crypto.scryptSync(password,salt,64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password,encoded){
  if(!encoded || typeof password!=="string") return false;
  const [scheme,saltText,hashText]=String(encoded).split("$");
  if(scheme!=="scrypt" || !saltText || !hashText) return false;
  const expected=Buffer.from(hashText,"base64url");
  const actual=crypto.scryptSync(password,Buffer.from(saltText,"base64url"),expected.length);
  return actual.length===expected.length && crypto.timingSafeEqual(actual,expected);
}

export function validatePersonInput(input={}){
  if(Object.prototype.hasOwnProperty.call(input,"password")) validatePassword(input.password);
  const firstName=String(input.firstName||"").trim();
  const middleName=String(input.middleName||"").trim()||null;
  const lastName=String(input.lastName||"").trim();
  if(!firstName || !lastName) throw new Error("firstName and lastName are required.");
  return {firstName,middleName,lastName,displayName:String(input.displayName||`${firstName} ${lastName}`).trim(),phone:normalizePhone(input.phone),dateOfBirth:input.dateOfBirth||null,sex:input.sex||null,nationality:input.nationality||null};
}
