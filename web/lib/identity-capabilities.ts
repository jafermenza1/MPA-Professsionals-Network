export const PROFESSIONAL_IDENTITY_ROLES = Object.freeze(["member", "professional"] as const);

export function hasProfessionalIdentity(roles: readonly string[] | null | undefined): boolean {
  return Array.isArray(roles) && roles.some((role) => PROFESSIONAL_IDENTITY_ROLES.includes(role as typeof PROFESSIONAL_IDENTITY_ROLES[number]));
}
