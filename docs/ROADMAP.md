# Roadmap

Phase 1 (this release) covers My Work and tasks, the SOP library, the freight calculator, and
access and administration. The phases below are meant to be built one at a time. NECS and
QuickBooks remain the systems of record throughout: Frasa HQ coordinates work and links to them.

Each phase should follow the Phase 1 pattern: its own migration file and `src/modules/<name>`
folder, access enforced by row level security, automated checks added to `scripts/verify-*.ts`
before it is called complete.

## Phase 2 — Purchasing and logistics coordination

**Goal:** everyone knows what is arriving, when, what paperwork is missing, and who has the next step.

- Shipment records (Miami to Aruba): supplier(s), forwarder, container or booking reference, status,
  ETD / ETA, with a calendar and list view.
- ETA updates with a history of changes and a notification to the people affected.
- Document checklist per shipment (commercial invoice, packing list, bill of lading, customs
  documents) with private file uploads.
- Purchasing-to-warehouse handoff: a "ready to receive" step that creates the warehouse's receiving
  task with the shipment's details.
- Exceptions: delays and damaged or short shipments, each with an owner, a next step and a due date.

**Builds on Phase 1:** tasks (handoffs and next steps are shared tasks linked to the shipment),
notifications, attachments, saved freight estimates (link an estimate to its shipment).
**New tables (sketch):** `shipments`, `shipment_events`, `shipment_documents`, `shipment_issues`.
**Decide first:** shipment statuses, the standard document list, who may edit ETAs, whether
warehouse staff see supplier names and costs.

## Phase 3 — Sales and supplier follow-up

**Goal:** no quote, sample or custom order is forgotten.

- Supplier and customer contacts (a lightweight directory for follow-up, not a replacement for NECS
  customer or vendor records), with the NECS reference on each.
- Quote follow-ups and sample requests with next-action dates.
- Custom order tracker (branded cups, pizza boxes): artwork received, proof approved, in production,
  expected arrival, arrived and checked, customer pickup or delivery, closed.
- Links to NECS orders, and to the Phase 2 shipment carrying the goods.

**Builds on Phase 1:** tasks and reminders drive every follow-up; the "custom-branded order" SOP
becomes the checklist template; attachments hold artwork and approvals.
**New tables (sketch):** `contacts`, `quote_requests`, `sample_requests`, `custom_orders`,
`custom_order_events`.
**Decide first:** the stages Frasa actually uses, who owns a custom order at each stage, how NECS
records can be referenced (number only, or a link).

## Phase 4 — Employee onboarding and internal requests

**Goal:** new employees get up to speed the same way every time, and internal requests have a clear path.

- Role-based onboarding checklists that create a set of tasks for a new employee and their lead.
- SOP training: assign a set of SOPs to read and acknowledge, with progress per person.
- Request forms with approvals (for example time off, purchase requests, access requests), with a
  configurable approver and an audit trail.
- Searchable company directory with department, role, phone and who covers for whom.

**Builds on Phase 1:** SOP acknowledgments, task checklists, profiles and departments, audit log.
**New tables (sketch):** `onboarding_templates`, `onboarding_assignments`, `request_types`,
`requests`, `request_approvals`; extra profile fields.
**Decide first:** which requests are worth formalising, approval limits, what personal information
employees may see about each other.

## Phase 5 — Workflow automation and operations reporting

**Goal:** fewer things rely on someone remembering, and leads can see where work gets stuck.

- Configurable triggers: missed approvals, late shipments, pending customer follow-ups, overdue SOP
  reviews, each with who is notified and when.
- Optional notification channels beyond in-app (email first; others if they prove necessary).
- Operations dashboard: overdue work by department, recurring issues, handoff delays, SOP
  acknowledgment and review status, shipment delays.
- Evaluate **read-only** integrations with NECS and QuickBooks, only where they remove double entry
  that has actually been observed in Phases 1 to 4 (for example showing an order's status next to
  its custom-order record).

**Builds on Phase 1:** the job runner, job log and de-duplicated notifications were built to take
more jobs; task history and the audit log are the raw material for reporting.
**Decide first:** which metrics leads would act on, what NECS and QuickBooks can export or expose,
and who is allowed to see company-wide numbers.

## Smaller items deferred from Phase 1

These came up while building and were left out on purpose:

- Email or mobile push for reminders (in-app only for now).
- Time-of-day deadlines and public-holiday awareness for recurring tasks.
- A board (kanban) or calendar view for tasks.
- Chargeable (volumetric) weight, tariff-code duty tables and selling-price margins in the calculator.
- Restricting individual SOPs to one department; choosing specific people to acknowledge.
- Two-step verification enforcement, and translation into other languages.
