import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/auth";
import { parseLinks, parseSteps, type SopLink, type SopStatus, type SopStep, type SopVersionStatus } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// ---------------------------------------------------------------------------
// Permissions. These mirror app.can_publish_sop_in / app.can_edit_sop in the
// database; row level security remains the source of truth.
// ---------------------------------------------------------------------------
export function canPublishIn(viewer: Viewer, departmentId: string | null): boolean {
  return viewer.isAdmin || (departmentId !== null && viewer.ledDepartmentIds.includes(departmentId));
}

export function canEditSop(viewer: Viewer, sop: { department_id: string | null; owner_id: string | null }): boolean {
  return canPublishIn(viewer, sop.department_id) || (sop.owner_id !== null && sop.owner_id === viewer.id);
}

export function canCreateSops(viewer: Viewer): boolean {
  return viewer.isAdmin || viewer.ledDepartmentIds.length > 0;
}

/** Audience of a SOP: its department's members, or everyone when company-wide. */
export function inAudience(viewer: Viewer, departmentId: string | null): boolean {
  return departmentId === null || viewer.departments.some((d) => d.id === departmentId);
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------
export type Option = { id: string; name: string };
export type PersonOption = { id: string; name: string };

export async function getSopReferenceData(supabase: Supabase) {
  const [departments, categories, people] = await Promise.all([
    supabase.from("departments").select("id, name").eq("is_active", true).order("name"),
    supabase.from("sop_categories").select("id, name").order("name"),
    supabase.from("profiles").select("id, full_name, email").eq("is_active", true).order("full_name"),
  ]);
  return {
    departments: (departments.data ?? []) as Option[],
    categories: (categories.data ?? []) as Option[],
    people: (people.data ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email })) as PersonOption[],
  };
}

const personName = (p: { full_name: string; email: string } | null | undefined) =>
  p ? p.full_name || p.email : null;

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------
const SOP_LIST_SELECT =
  "id, title, status, department_id, category_id, tags, owner_id, next_review_date, is_sample, " +
  "current_version_id, published_at, archived_at, updated_at, " +
  "department:departments(name), category:sop_categories(name), " +
  "owner:profiles!sops_owner_id_fkey(full_name, email), " +
  "current:sop_versions!sops_current_version_fk(id, version_no, requires_ack, published_at)";

type SopListRaw = {
  id: string;
  title: string;
  status: SopStatus;
  department_id: string | null;
  category_id: string | null;
  tags: string[];
  owner_id: string | null;
  next_review_date: string | null;
  is_sample: boolean;
  current_version_id: string | null;
  published_at: string | null;
  archived_at: string | null;
  updated_at: string;
  department: { name: string } | null;
  category: { name: string } | null;
  owner: { full_name: string; email: string } | null;
  current: { id: string; version_no: number; requires_ack: boolean; published_at: string | null } | null;
};

export type SopListItem = {
  id: string;
  title: string;
  status: SopStatus;
  departmentId: string | null;
  departmentName: string;
  categoryName: string | null;
  tags: string[];
  ownerId: string | null;
  ownerName: string | null;
  nextReviewDate: string | null;
  isSample: boolean;
  versionNo: number | null;
  publishedAt: string | null;
  updatedAt: string;
  requiresAck: boolean;
  currentVersionId: string | null;
  ackNeeded: boolean;
  draftVersionNo: number | null;
};

function toListItem(r: SopListRaw): SopListItem {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    departmentId: r.department_id,
    departmentName: r.department?.name ?? "Company-wide",
    categoryName: r.category?.name ?? null,
    tags: r.tags ?? [],
    ownerId: r.owner_id,
    ownerName: personName(r.owner),
    nextReviewDate: r.next_review_date,
    isSample: r.is_sample,
    versionNo: r.current?.version_no ?? null,
    publishedAt: r.current?.published_at ?? r.published_at,
    updatedAt: r.updated_at,
    requiresAck: r.current?.requires_ack ?? false,
    currentVersionId: r.current_version_id,
    ackNeeded: false,
    draftVersionNo: null,
  };
}

/** Search terms: letters and digits only, so they are safe inside a PostgREST filter. */
export function searchTerms(q: string): string[] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}-]/gu, ""))
    .filter((t) => t.length > 0)
    .slice(0, 6);
}

export type LibraryFilters = { q: string; department: string; category: string; tag: string };

export async function listPublishedSops(viewer: Viewer, filters: LibraryFilters) {
  const supabase = await createClient();
  let query = supabase.from("sops").select(SOP_LIST_SELECT).eq("status", "published");
  for (const term of searchTerms(filters.q)) {
    query = query.or(`search_text.ilike.%${term}%,title.ilike.%${term}%`);
  }
  if (filters.department === "company") query = query.is("department_id", null);
  else if (filters.department) query = query.eq("department_id", filters.department);
  if (filters.category) query = query.eq("category_id", filters.category);
  if (filters.tag) query = query.contains("tags", [filters.tag]);

  const { data, error } = await query.order("title").limit(500);
  if (error) throw new Error(error.message);
  const items = ((data ?? []) as unknown as SopListRaw[]).map(toListItem);

  // Which of these still need this employee's acknowledgment?
  const ackVersionIds = items
    .filter((i) => i.requiresAck && i.currentVersionId && inAudience(viewer, i.departmentId))
    .map((i) => i.currentVersionId!);
  if (ackVersionIds.length > 0) {
    const { data: acks } = await supabase
      .from("sop_acknowledgments")
      .select("sop_version_id")
      .eq("user_id", viewer.id)
      .in("sop_version_id", ackVersionIds);
    const acked = new Set((acks ?? []).map((a) => a.sop_version_id));
    for (const item of items) {
      item.ackNeeded =
        item.requiresAck && !!item.currentVersionId && inAudience(viewer, item.departmentId) && !acked.has(item.currentVersionId);
    }
  }
  return items;
}

/** Every tag in use on published SOPs, for the tag filter. */
export async function listPublishedTags(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("sops").select("tags").eq("status", "published").limit(1000);
  const tags = new Set<string>();
  for (const row of data ?? []) for (const t of row.tags ?? []) tags.add(t);
  return [...tags].sort((a, b) => a.localeCompare(b));
}

/**
 * Work in progress the viewer may edit: unpublished and archived SOPs, and
 * published SOPs with a draft revision. RLS limits this to SOPs they can edit.
 */
export async function listEditorSops(): Promise<SopListItem[]> {
  const supabase = await createClient();
  const { data: drafts } = await supabase.from("sop_versions").select("sop_id, version_no").eq("status", "draft");
  const draftBySop = new Map((drafts ?? []).map((d) => [d.sop_id, d.version_no]));

  const { data: unpublished, error } = await supabase
    .from("sops")
    .select(SOP_LIST_SELECT)
    .neq("status", "published")
    .order("title");
  if (error) throw new Error(error.message);
  const rows = (unpublished ?? []) as unknown as SopListRaw[];

  const revisedIds = [...draftBySop.keys()].filter((id) => !rows.some((r) => r.id === id));
  if (revisedIds.length > 0) {
    const { data: revised } = await supabase.from("sops").select(SOP_LIST_SELECT).in("id", revisedIds).order("title");
    rows.push(...((revised ?? []) as unknown as SopListRaw[]));
  }
  return rows.map((r) => ({ ...toListItem(r), draftVersionNo: draftBySop.get(r.id) ?? null }));
}

// ---------------------------------------------------------------------------
// One SOP
// ---------------------------------------------------------------------------
export type SopRecord = {
  id: string;
  title: string;
  status: SopStatus;
  department_id: string | null;
  category_id: string | null;
  tags: string[];
  owner_id: string | null;
  next_review_date: string | null;
  is_sample: boolean;
  current_version_id: string | null;
  published_at: string | null;
  archived_at: string | null;
  departmentName: string;
  categoryName: string | null;
  ownerName: string | null;
};

export async function getSop(id: string): Promise<SopRecord | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sops")
    .select(
      "id, title, status, department_id, category_id, tags, owner_id, next_review_date, is_sample, " +
        "current_version_id, published_at, archived_at, " +
        "department:departments(name), category:sop_categories(name), owner:profiles!sops_owner_id_fkey(full_name, email)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const r = data as unknown as SopListRaw;
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    department_id: r.department_id,
    category_id: r.category_id,
    tags: r.tags ?? [],
    owner_id: r.owner_id,
    next_review_date: r.next_review_date,
    is_sample: r.is_sample,
    current_version_id: r.current_version_id,
    published_at: r.published_at,
    archived_at: r.archived_at,
    departmentName: r.department?.name ?? "Company-wide",
    categoryName: r.category?.name ?? null,
    ownerName: personName(r.owner),
  };
}

export type SopVersion = {
  id: string;
  sopId: string;
  versionNo: number;
  status: SopVersionStatus;
  title: string;
  purpose: string;
  steps: SopStep[];
  links: SopLink[];
  changeSummary: string;
  requiresAck: boolean;
  publishedAt: string | null;
  publishedByName: string | null;
  updatedAt: string;
};

const VERSION_SELECT =
  "id, sop_id, version_no, status, title, purpose, steps, links, change_summary, requires_ack, " +
  "published_at, updated_at, publisher:profiles!sop_versions_published_by_fkey(full_name, email)";

type VersionRaw = {
  id: string;
  sop_id: string;
  version_no: number;
  status: SopVersionStatus;
  title: string;
  purpose: string;
  steps: unknown;
  links: unknown;
  change_summary: string;
  requires_ack: boolean;
  published_at: string | null;
  updated_at: string;
  publisher: { full_name: string; email: string } | null;
};

function toVersion(r: VersionRaw): SopVersion {
  return {
    id: r.id,
    sopId: r.sop_id,
    versionNo: r.version_no,
    status: r.status,
    title: r.title,
    purpose: r.purpose,
    steps: parseSteps(r.steps),
    links: parseLinks(r.links),
    changeSummary: r.change_summary,
    requiresAck: r.requires_ack,
    publishedAt: r.published_at,
    publishedByName: personName(r.publisher),
    updatedAt: r.updated_at,
  };
}

/** All versions of a SOP the viewer may see (drafts only come back for editors), newest first. */
export async function listVersions(sopId: string): Promise<SopVersion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sop_versions")
    .select(VERSION_SELECT)
    .eq("sop_id", sopId)
    .order("version_no", { ascending: false });
  return ((data ?? []) as unknown as VersionRaw[]).map(toVersion);
}

export type SopAttachment = {
  id: string;
  fileName: string;
  sizeBytes: number | null;
  storagePath: string;
};

export async function listAttachments(versionId: string): Promise<SopAttachment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sop_attachments")
    .select("id, file_name, size_bytes, storage_path")
    .eq("sop_version_id", versionId)
    .order("created_at");
  return (data ?? []).map((a) => ({
    id: a.id,
    fileName: a.file_name,
    sizeBytes: a.size_bytes,
    storagePath: a.storage_path,
  }));
}

// ---------------------------------------------------------------------------
// Acknowledgments
// ---------------------------------------------------------------------------
export async function hasAcknowledged(versionId: string, userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sop_acknowledgments")
    .select("acknowledged_at")
    .eq("sop_version_id", versionId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.acknowledged_at ?? null;
}

export type AckRow = { userId: string; name: string; email: string; acknowledgedAt: string | null };

/** Everyone expected to acknowledge a version, with when they did. Editors only (RLS). */
export async function getAckStatus(sop: { department_id: string | null }, versionId: string): Promise<AckRow[]> {
  const supabase = await createClient();
  let audienceIds: string[] | null = null;
  if (sop.department_id) {
    const { data: members } = await supabase
      .from("department_members")
      .select("user_id")
      .eq("department_id", sop.department_id);
    audienceIds = (members ?? []).map((m) => m.user_id);
    if (audienceIds.length === 0) return [];
  }
  let people = supabase.from("profiles").select("id, full_name, email").eq("is_active", true);
  if (audienceIds) people = people.in("id", audienceIds);
  const [{ data: profiles }, { data: acks }] = await Promise.all([
    people.order("full_name"),
    supabase.from("sop_acknowledgments").select("user_id, acknowledged_at").eq("sop_version_id", versionId),
  ]);
  const ackedAt = new Map((acks ?? []).map((a) => [a.user_id, a.acknowledged_at]));
  return (profiles ?? [])
    .map((p) => ({
      userId: p.id,
      name: p.full_name || p.email,
      email: p.email,
      acknowledgedAt: ackedAt.get(p.id) ?? null,
    }))
    .sort((a, b) => Number(!!a.acknowledgedAt) - Number(!!b.acknowledgedAt) || a.name.localeCompare(b.name));
}
