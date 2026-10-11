export function createAuditEvent({actorUserId=null,action,resourceType,resourceId=null,requestId=null,outcome="success",metadata={}}){
  return {actorUserId,action,resourceType,resourceId,requestId,outcome,metadata,occurredAt:new Date().toISOString()};
}
export class AuditSink { async record(){throw new Error("No audit sink configured.");} }
