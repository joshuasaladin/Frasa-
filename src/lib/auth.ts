import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

import type { FreightAccess, Role } from "./auth-labels";
export type { FreightAccess, Role };

export type Viewer = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  freightAccess: FreightAccess;
  departments: { id: string; name: string; isLead: boolean }[];
  /** Departments where this user has lead powers (role must also be department_lead). */
  ledDepartmentIds: string[];
  isAdmin: boolean;
  canViewFreight: boolean;
  canEditFreight: boolean;
};

/**
 * The signed-in, active employee, or null. The session is verified with the
 * auth server (getUser), and the profile is read through row level security.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, freight_access, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !profile.is_active) return null;

  const { data: memberships } = await supabase
    .from("department_members")
    .select("is_lead, departments(id, name)")
    .eq("user_id", user.id);

  const departments = (memberships ?? [])
    .filter((m) => m.departments)
    .map((m) => ({ id: m.departments!.id, name: m.departments!.name, isLead: m.is_lead }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name || profile.email,
    role: profile.role,
    freightAccess: profile.freight_access,
    departments,
    ledDepartmentIds:
      profile.role === "department_lead" ? departments.filter((d) => d.isLead).map((d) => d.id) : [],
    isAdmin: profile.role === "admin",
    canViewFreight: profile.freight_access !== "none",
    canEditFreight: profile.freight_access === "edit",
  };
});

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) notFound();
  return viewer;
}

/** Pages for freight estimates answer "not found" to anyone without access. */
export async function requireFreightAccess(level: "view" | "edit" = "view"): Promise<Viewer> {
  const viewer = await requireViewer();
  if (level === "edit" ? !viewer.canEditFreight : !viewer.canViewFreight) notFound();
  return viewer;
}

export { ROLE_LABELS, FREIGHT_ACCESS_LABELS } from "./auth-labels";
