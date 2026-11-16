import type { Database } from "@/lib/supabase/database.types";

export type Role = Database["public"]["Enums"]["user_role"];
export type FreightAccess = Database["public"]["Enums"]["freight_access"];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  department_lead: "Department lead",
  employee: "Employee",
};

export const FREIGHT_ACCESS_LABELS: Record<FreightAccess, string> = {
  none: "No access",
  view: "View",
  edit: "View and edit",
};
