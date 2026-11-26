import {
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Swords,
  UserRound,
} from "lucide-react";
import { ASSESSMENT_ROLES } from "./roleAccess.js";

export const ROLE_NAVIGATION = {
  [ASSESSMENT_ROLES.CANDIDATE]: [
    { path: "/", label: "Dashboard", icon: LayoutDashboard },
    { path: "/challenges", label: "Challenges", icon: CalendarDays },
    { path: "/learning", label: "Thrive", icon: BookOpen },
    { path: "/my-challenges", label: "My Challenges", icon: ClipboardList },
  ],
  [ASSESSMENT_ROLES.ORGANIZATION_USER]: [
    { path: "/", label: "Dashboard", icon: LayoutDashboard },
    { path: "/challenges", label: "Challenges", icon: CalendarDays },
    { path: "/learning", label: "Thrive", icon: BookOpen },
    { path: "/my-challenges", label: "My Challenges", icon: ClipboardList },
    { path: "/organisation", label: "Organisation", icon: Building2 },
  ],
  [ASSESSMENT_ROLES.SUPER_ADMIN]: [
  { path: "/admin", label: "Daily Challenge", icon: CalendarDays },
    { path: "/admin/organisations", label: "Organisations", icon: Building2 },
    { path: "/admin/learning", label: "Thrive", icon: BookOpen },
  ],
};

export const ROLE_LABELS = {
  [ASSESSMENT_ROLES.CANDIDATE]: "Participant",
  [ASSESSMENT_ROLES.ORGANIZATION_USER]: "Organization Admin",
  [ASSESSMENT_ROLES.SUPER_ADMIN]: "AMUX Admin",
};
