import { FREIGHT_ACCESS_LABELS, ROLE_LABELS, type FreightAccess, type Role } from "@/lib/auth-labels";

export const AUDIT_GROUPS: Record<string, string> = {
  user: "Users and roles",
  sop: "SOPs",
  freight_estimate: "Freight estimates",
  settings: "Settings",
};

/** One readable sentence for an audit_log row. */
export function describeAudit(action: string, detail: unknown): string {
  const d = (detail ?? {}) as Record<string, unknown>;
  const s = (k: string) => String(d[k] ?? "");
  switch (action) {
    case "user.created": return `Account created for ${s("email")}`;
    case "user.role_changed": return `Role changed from ${ROLE_LABELS[d.from as Role] ?? s("from")} to ${ROLE_LABELS[d.to as Role] ?? s("to")} (${s("email")})`;
    case "user.freight_access_changed": return `Freight access changed from “${FREIGHT_ACCESS_LABELS[d.from as FreightAccess] ?? s("from")}” to “${FREIGHT_ACCESS_LABELS[d.to as FreightAccess] ?? s("to")}” (${s("email")})`;
    case "user.deactivated": return `Deactivated ${s("email")}`;
    case "user.reactivated": return `Reactivated ${s("email")}`;
    case "user.department_added": return `Added to ${s("department")}${d.is_lead ? " as lead" : ""}`;
    case "user.department_removed": return `Removed from ${s("department")}`;
    case "user.department_lead_changed": return `${d.is_lead ? "Made lead of" : "No longer lead of"} ${s("department")}`;
    case "sop.published": return `Published “${s("title")}” version ${s("version_no")}${d.requires_ack ? " with acknowledgment requested" : ""}`;
    case "sop.archived": return `Archived “${s("title")}”`;
    case "sop.restored": return `Restored “${s("title")}”`;
    case "freight_estimate.created": return `Saved new freight estimate “${s("name")}”${d.is_complete === false ? " (incomplete)" : ""}`;
    case "freight_estimate.edited": return `Saved version ${s("version_no")} of freight estimate “${s("name")}”${d.is_complete === false ? " (incomplete)" : ""}${s("note") ? ` — ${s("note")}` : ""}`;
    case "freight_estimate.duplicated": return `Duplicated a freight estimate as “${s("name")}”`;
    case "freight_estimate.archived": return `Archived freight estimate “${s("name")}”`;
    case "freight_estimate.restored": return `Restored freight estimate “${s("name")}”`;
    case "settings.changed": return `Changed a setting`;
    default: return action;
  }
}
