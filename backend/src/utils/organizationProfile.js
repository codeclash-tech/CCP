export function normalizeOrganizationProfileName(value) {
  if (typeof value !== "string") return "";

  const organization = value.trim();
  if (
    organization.length < 1 ||
    organization.length > 120 ||
    /[\u0000-\u001f\u007f]/.test(organization) ||
    organization.toLowerCase() === "unspecified"
  ) {
    return "";
  }

  return organization;
}

export function getOrganizationProfileName(user) {
  return normalizeOrganizationProfileName(user?.organization);
}
