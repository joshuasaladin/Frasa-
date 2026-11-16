import "server-only";
import type { Viewer } from "@/lib/auth";
import { addDays, arubaToday, isIsoDate } from "@/lib/dates";
import { isUuid } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";
import { OPEN_STATUSES, PRIORITY_RANK, STATUSES, type TaskStatus } from "./labels";

const TASK_LIST_COLUMNS =
  "id, title, kind, owner_id, department_id, due_date, priority, status, series_id, scheduled_for, escalate_overdue, is_demo, " +
  "owner:profiles!tasks_owner_id_fkey(id, full_name, email), department:departments(id, name)";

export type TaskListRow = {
  id: string;
  title: string;
  kind: "personal" | "shared";
  owner_id: string;
  department_id: string | null;
  due_date: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  status: TaskStatus;
  series_id: string | null;
  scheduled_for: string | null;
  escalate_overdue: boolean;
  is_demo: boolean;
  owner: { id: string; full_name: string; email: string } | null;
  department: { id: string; name: string } | null;
};

export type TaskFilters = {
  scope: "mine" | "all";
  owner: string;
  department: string;
  status: "open" | "any" | TaskStatus;
  due: "" | "overdue" | "today" | "week" | "range";
  from: string;
  to: string;
  q: string;
};

export function parseTaskFilters(p: Record<string, string | string[] | undefined>): TaskFilters {
  const one = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
  const status = one("status");
  const due = one("due");
  return {
    scope: one("scope") === "all" ? "all" : "mine",
    owner: isUuid(one("owner")) ? one("owner") : "",
    department: isUuid(one("department")) ? one("department") : "",
    status: status === "any" || (STATUSES as string[]).includes(status) ? (status as TaskFilters["status"]) : "open",
    due: (["overdue", "today", "week", "range"] as const).find((d) => d === due) ?? "",
    from: isIsoDate(one("from")) ? one("from") : "",
    to: isIsoDate(one("to")) ? one("to") : "",
    q: one("q").slice(0, 100),
  };
}

export function sortTasks<T extends { due_date: string | null; priority: keyof typeof PRIORITY_RANK; title: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      a.title.localeCompare(b.title),
  );
}

/** Tasks the viewer may see (row level security decides), narrowed by the filters. */
export async function listTasks(viewer: Viewer, f: TaskFilters): Promise<TaskListRow[]> {
  const supabase = await createClient();
  const today = arubaToday();
  let query = supabase.from("tasks").select(TASK_LIST_COLUMNS).limit(500);

  if (f.scope === "mine" && !f.owner) query = query.eq("owner_id", viewer.id);
  if (f.owner) query = query.eq("owner_id", f.owner);
  if (f.department) query = query.eq("department_id", f.department);
  if (f.status === "open") query = query.in("status", OPEN_STATUSES);
  else if (f.status !== "any") query = query.eq("status", f.status);
  if (f.due === "overdue") query = query.lt("due_date", today);
  if (f.due === "today") query = query.eq("due_date", today);
  if (f.due === "week") query = query.gte("due_date", today).lte("due_date", addDays(today, 7));
  if (f.due === "range") {
    if (f.from) query = query.gte("due_date", f.from);
    if (f.to) query = query.lte("due_date", f.to);
  }
  if (f.q) query = query.ilike("title", `%${f.q.replace(/[%_\\]/g, "\\$&")}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return sortTasks((data ?? []) as unknown as TaskListRow[]);
}

export type Person = { id: string; name: string; departmentIds: string[]; ledDepartmentIds: string[] };

/** Active employees with their departments (directory data, readable by everyone). */
export async function listPeople(): Promise<Person[]> {
  const supabase = await createClient();
  const [{ data: profiles }, { data: members }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role").eq("is_active", true).order("full_name"),
    supabase.from("department_members").select("user_id, department_id, is_lead"),
  ]);
  return (profiles ?? []).map((p) => {
    const mine = (members ?? []).filter((m) => m.user_id === p.id);
    return {
      id: p.id,
      name: p.full_name || p.email,
      departmentIds: mine.map((m) => m.department_id),
      ledDepartmentIds: p.role === "department_lead" ? mine.filter((m) => m.is_lead).map((m) => m.department_id) : [],
    };
  });
}

export async function listDepartments() {
  const supabase = await createClient();
  const { data } = await supabase.from("departments").select("id, name, is_active").order("name");
  return data ?? [];
}

/** The same rule as app.can_create_task in the database, used to build form options. */
export function canAssign(viewer: Viewer, owner: Person, departmentId: string): boolean {
  if (viewer.isAdmin) return true;
  if (viewer.ledDepartmentIds.includes(departmentId)) {
    return owner.id === viewer.id || owner.departmentIds.includes(departmentId);
  }
  if (owner.id === viewer.id && viewer.departments.some((d) => d.id === departmentId)) return true;
  return viewer.role === "department_lead" && owner.ledDepartmentIds.includes(departmentId);
}

export async function getTaskFormOptions(viewer: Viewer) {
  const supabase = await createClient();
  const [people, departments, { data: sops }, freight, { data: settings }] = await Promise.all([
    listPeople(),
    listDepartments(),
    supabase.from("sops").select("id, title").eq("status", "published").order("title"),
    viewer.canViewFreight
      ? supabase.from("freight_estimates").select("id, name, reference").is("archived_at", null).order("updated_at", { ascending: false }).limit(200)
      : Promise.resolve({ data: [] as { id: string; name: string; reference: string }[] }),
    supabase.from("app_settings").select("value").eq("key", "notification_defaults").maybeSingle(),
  ]);
  const defaults = (settings?.value ?? {}) as { remind_days_before?: number; escalate_overdue?: boolean };
  const activeDepartments = departments.filter((d) => d.is_active);
  // Every owner/department pair this viewer may use; the form filters owners by department.
  const assignable: Record<string, string[]> = {};
  for (const d of activeDepartments) {
    const ids = people.filter((p) => canAssign(viewer, p, d.id)).map((p) => p.id);
    if (ids.length) assignable[d.id] = ids;
  }
  return {
    people: people.map((p) => ({ id: p.id, name: p.name })),
    departments: activeDepartments.filter((d) => assignable[d.id]).map((d) => ({ id: d.id, name: d.name })),
    assignable,
    sops: sops ?? [],
    freightEstimates: (freight.data ?? []).map((e) => ({ id: e.id, name: e.reference ? `${e.name} (${e.reference})` : e.name })),
    defaultRemindDays: defaults.remind_days_before ?? 1,
    defaultEscalate: defaults.escalate_overdue ?? true,
  };
}

export type TaskFormOptions = Awaited<ReturnType<typeof getTaskFormOptions>>;

export async function getTask(id: string) {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select(
      "*, owner:profiles!tasks_owner_id_fkey(id, full_name, email), creator:profiles!tasks_created_by_fkey(id, full_name, email), " +
        "completer:profiles!tasks_completed_by_fkey(id, full_name, email), department:departments(id, name), " +
        "sop:sops(id, title, status), series:task_series(id, title, frequency, interval_count, schedule_mode, weekdays, is_active)",
    )
    .eq("id", id)
    .maybeSingle();
  return data as unknown as TaskDetail | null;
}

type Who = { id: string; full_name: string; email: string } | null;
export type TaskDetail = import("@/lib/supabase/database.types").Database["public"]["Tables"]["tasks"]["Row"] & {
  owner: Who;
  creator: Who;
  completer: Who;
  department: { id: string; name: string } | null;
  sop: { id: string; title: string; status: string } | null;
  series: {
    id: string;
    title: string;
    frequency: "daily" | "weekly" | "monthly";
    interval_count: number;
    schedule_mode: "fixed_schedule" | "after_completion";
    weekdays: number[] | null;
    is_active: boolean;
  } | null;
};

export function canEditTask(viewer: Viewer, t: { kind: string; owner_id: string; department_id: string | null }): boolean {
  if (t.kind === "personal") return t.owner_id === viewer.id;
  return viewer.isAdmin || t.owner_id === viewer.id || (!!t.department_id && viewer.ledDepartmentIds.includes(t.department_id));
}

export function canManageTask(viewer: Viewer, t: { kind: string; owner_id: string; department_id: string | null }): boolean {
  if (t.kind === "personal") return t.owner_id === viewer.id;
  return viewer.isAdmin || (!!t.department_id && viewer.ledDepartmentIds.includes(t.department_id));
}
