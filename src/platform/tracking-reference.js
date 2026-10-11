const PREFIX_BY_TYPE=Object.freeze({membership:"MEM",organization:"ORG",job:"JOB"});

export function formatTrackingReference(type,year,serial){
  const prefix=PREFIX_BY_TYPE[type];
  const normalizedYear=String(year||"");
  const normalizedSerial=String(serial||"");
  if(!prefix)throw new TypeError("Unsupported tracking-reference type.");
  if(!/^\d{2}$/.test(normalizedYear))throw new TypeError("Tracking-reference year must contain two digits.");
  if(!/^\d+$/.test(normalizedSerial)||BigInt(normalizedSerial)<1n)throw new TypeError("Tracking-reference serial must be a positive integer.");
  return "MPA-"+prefix+"-"+normalizedYear+"-"+normalizedSerial.padStart(6,"0");
}

export async function nextTrackingReference(db,type){
  const result=await db.query("select to_char(current_date,'YY') year,nextval('application_tracking_reference_seq')::text serial");
  const row=result.rows[0];
  return formatTrackingReference(type,row.year,row.serial);
}