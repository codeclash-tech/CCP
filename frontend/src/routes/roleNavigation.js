import {
  Award,
  BarChart3,
  CalendarDays,
  FileQuestion,
  LayoutDashboard,
  Swords,
  UserRound,
} from "lucide-react";
import { ASSESSMENT_ROLES } from "./roleAccess.js";

export const ROLE_NAVIGATION = {
  [ASSESSMENT_ROLES.CANDIDATE]: [
    { path: "/", label: "Dashboard", icon: LayoutDashboard },
    { path: "/battle-room", label: "Battle Rooms", icon: Swords },
    { path: "/weekly-assessment", label: "Daily Global Challenge", icon: CalendarDays },
    { path: "/rankings", label: "Rankings", icon: BarChart3 },
    { path: "/certificates", label: "Certificates", icon: Award },
    { path: "/profile", label: "Profile", icon: UserRound },
  ],
  [ASSESSMENT_ROLES.ORGANIZATION_USER]: [
    { path: "/", label: "Dashboard", icon: LayoutDashboard },
    { path: "/battle-room", label: "My Battle Rooms", icon: Swords },
    { path: "/weekly-assessment", label: "Daily Global Challenge", icon: CalendarDays },
    { path: "/rankings", label: "Rankings", icon: BarChart3 },
    { path: "/certificates", label: "Certificates", icon: Award },
    { path: "/profile", label: "Profile", icon: UserRound },
  ],
  [ASSESSMENT_ROLES.SUPER_ADMIN]: [
    {
      path: "/admin/weekly-assessment",
      label: "Global Challenge",
      icon: CalendarDays,
    },
    {
      path: "/admin/questions",
      label: "Questions",
      icon: FileQuestion,
    },
    { path: "/admin/rankings", label: "Global Rankings", icon: BarChart3 },
    { path: "/profile", label: "Profile", icon: UserRound },
  ],
};

export const ROLE_LABELS = {
  [ASSESSMENT_ROLES.CANDIDATE]: "Participant",
  [ASSESSMENT_ROLES.ORGANIZATION_USER]: "Organization User",
  [ASSESSMENT_ROLES.SUPER_ADMIN]: "Administrator",
};
