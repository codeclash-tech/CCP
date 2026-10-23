export const ASSESSMENT_ROLES = Object.freeze({
  CANDIDATE: "CANDIDATE",
  ORGANIZATION_USER: "ORGANIZATION_USER",
  SUPER_ADMIN: "SUPER_ADMIN",
});

export function getAssessmentRole(user) {
  if (user?.role === "ADMIN") return ASSESSMENT_ROLES.SUPER_ADMIN;
  if (
    user?.role === "USER" &&
    (user?.assessmentRole === ASSESSMENT_ROLES.ORGANIZATION_USER ||
      user?.creatorType === "ORGANIZATION")
  ) {
    return ASSESSMENT_ROLES.ORGANIZATION_USER;
  }
  return ASSESSMENT_ROLES.CANDIDATE;
}

export function hasAnyAssessmentRole(user, allowedRoles) {
  return allowedRoles.includes(getAssessmentRole(user));
}

export function canAccessRoute(user, pathname) {
  if (/^\/admin(?:\/|$)/.test(pathname)) {
    return hasAnyAssessmentRole(user, [ASSESSMENT_ROLES.SUPER_ADMIN]);
  }

  if (/^\/assessments\/edit(?:\/|$)/.test(pathname)) {
    return hasAnyAssessmentRole(user, [
      ASSESSMENT_ROLES.ORGANIZATION_USER,
      ASSESSMENT_ROLES.SUPER_ADMIN,
    ]);
  }

  return true;
}
