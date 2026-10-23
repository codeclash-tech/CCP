import { getAssessmentRole } from "../models/User.js";

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required." });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Access denied. Insufficient permissions.",
        requiredRoles: roles,
        userRole: req.user.role,
      });
    }

    next();
  };
}

export function requireAssessmentRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const assessmentRole = getAssessmentRole(req.user);
    if (!roles.includes(assessmentRole)) {
      return res.status(403).json({
        error: "Access denied. Insufficient permissions.",
        requiredRoles: roles,
        userRole: assessmentRole,
      });
    }

    next();
  };
}

export const isAdmin = requireRole("ADMIN");
export const isUser = requireRole("USER", "ADMIN");
