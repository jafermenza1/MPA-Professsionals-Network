/**
 * Shared account capability policy.
 *
 * A user's organization workspace and personal professional identity are
 * separate capabilities. Organization membership must be checked against the
 * requested organization; it must never be inferred from a platform role.
 * Membership is current only when status and inclusive UTC date bounds agree.
 */
export const PROFESSIONAL_IDENTITY_ROLES = Object.freeze(["member", "professional"]);
export const ORGANIZATION_RESOURCE_ROLES = Object.freeze(["owner", "administrator", "recruiter", "project_manager"]);

export function policyError(status, message, code = "BUSINESS_RULE") {
  const error = new Error(message);
  error.statusCode = status;
  error.code = code;
  return error;
}

export async function accountRoles(db, userId) {
  const result = await db.query(
    "select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",
    [userId],
  );
  return result.rows.map((row) => row.role_code);
}

export async function hasProfessionalIdentity(db, userId) {
  const roles = await accountRoles(db, userId);
  return roles.some((role) => PROFESSIONAL_IDENTITY_ROLES.includes(role));
}

export async function assertProfessionalIdentity(db, userId) {
  if (!(await hasProfessionalIdentity(db, userId))) {
    throw policyError(
      403,
      "This account is set up for organization work. Personal professional profiles are available through a member/professional account.",
      "PROFESSIONAL_PROFILE_FORBIDDEN",
    );
  }
}

export async function hasCurrentActiveMembership(db, userId) {
  const result = await db.query(
    "select 1 from membership_record where user_id=$1 and status='active' and start_date<=current_date and (end_date is null or end_date>=current_date) limit 1",
    [userId],
  );
  return result.rowCount > 0;
}

export async function assertCurrentActiveMembership(db, userId, message = "A current, active membership is required for this action.") {
  if (!(await hasCurrentActiveMembership(db, userId))) {
    throw policyError(403, message, "MEMBERSHIP_REQUIRED");
  }
}

export async function assertProfessionalProfileCapability(db, userId, { requireActiveMembership = false } = {}) {
  await assertProfessionalIdentity(db, userId);
  if (requireActiveMembership) {
    await assertCurrentActiveMembership(
      db,
      userId,
      "Your membership must be active and within its validity dates to edit a professional profile. View membership options to continue.",
    );
  }
}

export async function assertOrganizationCapability(db, organizationId, userId, allowedRoles = ORGANIZATION_RESOURCE_ROLES) {
  const result = await db.query(
    "select om.role_code,o.verification_status from organization_membership om join organization o on o.id=om.organization_id where om.organization_id=$1 and om.user_id=$2 and om.status='active'",
    [organizationId, userId],
  );
  const membership = result.rows[0];
  if (!membership || !allowedRoles.includes(membership.role_code)) {
    throw policyError(403, "You do not have permission to manage this organization's resources.", "ORGANIZATION_FORBIDDEN");
  }
  return membership;
}
