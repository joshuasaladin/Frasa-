import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { arubaToday, formatDate } from "@/lib/dates";
import { isUuid } from "@/lib/action";
import { Card, Empty, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import {
  canCreateSops,
  getSopReferenceData,
  listEditorSops,
  listPublishedSops,
  listPublishedTags,
  type SopListItem,
} from "@/modules/sops/queries";

export const metadata = { title: "SOP library · Frasa HQ" };

type Search = { q?: string; department?: string; category?: string; tag?: string; group?: string; view?: string };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function SopLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireViewer();
  const raw = await searchParams;
  const params: Required<Search> = {
    q: first(raw.q).slice(0, 100),
    department: first(raw.department),
    category: first(raw.category),
    tag: first(raw.tag).slice(0, 40),
    group: first(raw.group) === "category" ? "category" : "department",
    view: first(raw.view) === "drafts" ? "drafts" : "published",
  };
  const filters = {
    q: params.q,
    department: params.department === "company" || isUuid(params.department) ? params.department : "",
    category: isUuid(params.category) ? params.category : "",
    tag: params.tag,
  };

  const supabase = await createClient();
  const [reference, editorSops, tags] = await Promise.all([
    getSopReferenceData(supabase),
    listEditorSops(),
    listPublishedTags(),
  ]);
  const showDraftsTab = canCreateSops(viewer) || editorSops.length > 0;
  const view = showDraftsTab ? params.view : "published";
  const today = arubaToday();

  return (
    <>
      <PageHeader
        eyebrow="Knowledge"
        title="SOP library"
        subtitle="Current, published procedures. Search by what you are trying to do."
        actions={
          canCreateSops(viewer) ? (
            <Link href="/sops/new" className="btn btn-primary">
              <Icon name="plus" /> New SOP
            </Link>
          ) : null
        }
      />

      {showDraftsTab ? (
        <div className="mb-4 flex gap-2">
          <Link href="/sops" className={`btn btn-sm ${view === "published" ? "btn-primary" : ""}`}>
            Published
          </Link>
          <Link href="/sops?view=drafts" className={`btn btn-sm ${view === "drafts" ? "btn-primary" : ""}`}>
            Drafts and archived{editorSops.length > 0 ? ` (${editorSops.length})` : ""}
          </Link>
        </div>
      ) : null}

      {view === "drafts" ? (
        <DraftsView items={editorSops} />
      ) : (
        <PublishedView
          items={await listPublishedSops(viewer, filters)}
          params={params}
          filters={filters}
          departments={reference.departments}
          categories={reference.categories}
          tags={tags}
          today={today}
        />
      )}
    </>
  );
}

function PublishedView({
  items,
  params,
  filters,
  departments,
  categories,
  tags,
  today,
}: {
  items: SopListItem[];
  params: Required<Search>;
  filters: { q: string; department: string; category: string; tag: string };
  departments: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  tags: string[];
  today: string;
}) {
  const filtered = !!(filters.q || filters.department || filters.category || filters.tag);
  const groups = new Map<string, SopListItem[]>();
  for (const item of items) {
    const key = params.group === "category" ? (item.categoryName ?? "Uncategorised") : item.departmentName;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const groupNames = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  const ackCount = items.filter((i) => i.ackNeeded).length;

  return (
    <>
      <form method="get" action="/sops" className="card mb-4 p-3">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            <Icon name="search" />
          </span>
          <input
            type="search"
            name="q"
            defaultValue={params.q}
            placeholder="Search procedures, steps and tags…"
            aria-label="Search SOPs"
            className="input pl-10"
            autoComplete="off"
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <select name="department" defaultValue={filters.department} aria-label="Department" className="input">
            <option value="">All departments</option>
            <option value="company">Company-wide</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select name="category" defaultValue={filters.category} aria-label="Category" className="input">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select name="tag" defaultValue={filters.tag} aria-label="Tag" className="input">
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>
          <select name="group" defaultValue={params.group} aria-label="Group by" className="input">
            <option value="department">Group by department</option>
            <option value="category">Group by category</option>
          </select>
          <div className="col-span-2 flex gap-2 sm:col-span-1">
            <button type="submit" className="btn btn-primary flex-1">
              Search
            </button>
            {filtered ? (
              <Link href="/sops" className="btn">
                Clear
              </Link>
            ) : null}
          </div>
        </div>
      </form>

      {ackCount > 0 ? (
        <p className="mb-3 rounded-lg border border-orange-200 bg-brand-100 px-3 py-2 text-sm font-medium text-brand-600">
          {ackCount === 1 ? "1 procedure needs" : `${ackCount} procedures need`} your acknowledgment.
        </p>
      ) : null}

      {items.length === 0 ? (
        <Card>
          <Empty>
            {filtered
              ? "No published SOPs match your search. Try fewer words or clear the filters."
              : "No SOPs have been published yet."}
          </Empty>
        </Card>
      ) : (
        <div className="space-y-4">
          {groupNames.map((name) => (
            <Card key={name} title={`${name} (${groups.get(name)!.length})`} padded={false}>
              <ul className="divide-y divide-line">
                {groups.get(name)!.map((item) => (
                  <SopRow key={item.id} item={item} today={today} groupBy={params.group} />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function SopRow({ item, today, groupBy }: { item: SopListItem; today: string; groupBy: string }) {
  const reviewOverdue = !!item.nextReviewDate && item.nextReviewDate < today;
  return (
    <li>
      <Link href={`/sops/${item.id}`} className="block px-4 py-3 hover:bg-paper/70">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[15px] font-semibold text-ink">{item.title}</span>
          {item.ackNeeded ? <span className="badge badge-orange">Acknowledgment needed</span> : null}
          {reviewOverdue ? <span className="badge badge-amber">Review overdue</span> : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>{groupBy === "category" ? item.departmentName : (item.categoryName ?? "Uncategorised")}</span>
          <span>Owner: {item.ownerName ?? "—"}</span>
          {item.versionNo ? <span>v{item.versionNo}</span> : null}
          <span>Next review: {formatDate(item.nextReviewDate)}</span>
        </div>
        {item.tags.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.tags.map((t) => (
              <span key={t} className="badge badge-gray">
                #{t}
              </span>
            ))}
          </div>
        ) : null}
      </Link>
    </li>
  );
}

function DraftsView({ items }: { items: SopListItem[] }) {
  if (items.length === 0) {
    return (
      <Card>
        <Empty>Nothing in progress. Drafts, revisions and archived SOPs you can edit appear here.</Empty>
      </Card>
    );
  }
  const sections: { title: string; hint: string; rows: SopListItem[] }[] = [
    {
      title: "Not yet published",
      hint: "Employees cannot see these.",
      rows: items.filter((i) => i.status === "draft"),
    },
    {
      title: "Revisions in progress",
      hint: "Employees keep seeing the published version until the revision is published.",
      rows: items.filter((i) => i.status === "published"),
    },
    { title: "Archived", hint: "Hidden from employees. Can be restored.", rows: items.filter((i) => i.status === "archived") },
  ];
  return (
    <div className="space-y-4">
      {sections
        .filter((s) => s.rows.length > 0)
        .map((section) => (
          <Card key={section.title} title={`${section.title} (${section.rows.length})`} padded={false}>
            <p className="border-b border-line px-4 py-2 text-xs text-muted">{section.hint}</p>
            <ul className="divide-y divide-line">
              {section.rows.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/sops/${item.id}/edit`}
                    className="block px-4 py-3 hover:bg-paper/70"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[15px] font-semibold text-ink">{item.title}</span>
                      {item.isSample ? (
                        <span className="badge badge-orange">Sample — revise before publishing</span>
                      ) : null}
                      {item.status === "archived" ? <span className="badge badge-gray">Archived</span> : null}
                      {item.draftVersionNo ? (
                        <span className="badge badge-blue">Draft v{item.draftVersionNo}</span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                      <span>{item.departmentName}</span>
                      <span>{item.categoryName ?? "Uncategorised"}</span>
                      <span>Owner: {item.ownerName ?? "not assigned"}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
    </div>
  );
}
