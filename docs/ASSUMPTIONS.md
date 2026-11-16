# Assumptions that need Frasa's input

Phase 1 had to make choices where Frasa's own rules were not known. Each one below says what the
app does today and what Frasa should confirm or supply. Items marked **Needed before rollout**
block real use; the rest can be decided while people start using the app.

## Settings Frasa must supply

| # | Setting | Where | Status |
| --- | --- | --- | --- |
| 1 | Production Supabase project, app address (domain), and hosting account | [OPERATIONS.md](OPERATIONS.md) | **Needed before rollout** |
| 2 | Email service (SMTP) for invitations and password resets, and the sender address | Supabase → Authentication → Emails | **Needed before rollout** |
| 3 | Who the first admin is (name and work email) | `npm run create-admin` | **Needed before rollout** |
| 4 | Employee list: name, work email, department(s), who leads each department | Admin → Users | **Needed before rollout** |
| 5 | Who may see supplier costs (freight access: none / view / edit) | Admin → Users | **Needed before rollout** |
| 6 | The logo file | `public/brand/frasa-logo.svg` or `.png` | Optional; a text wordmark is shown until then |
| 7 | Reminder lead time and whether new shared tasks escalate by default | Admin → Settings (currently 1 day, escalation on) | Confirm |
| 8 | Exchange rate Frasa uses for costing, and its source | Admin → Settings, or per estimate | Supply, or leave blank so each estimate asks |
| 9 | The usual shipment charges and how each is allocated | Admin → Settings | Supply |
| 10 | Duty and tax rates and what each is calculated on | Entered per estimate | Supply to the people who build estimates |
| 11 | Revised text for the three sample SOPs, with an owner and review date each | SOP library → Drafts and archived | Before publishing them |
| 12 | SOP categories | Admin → Departments | Confirm the starting list |

## Freight calculator

The calculator contains **no Frasa rates**. Nothing is pre-filled except what an admin enters under
Settings, and a blank required input is never treated as zero: the estimate is labelled
**INCOMPLETE** and totals that depend on the missing value are not shown.

What it assumes, for Frasa to confirm:

| Topic | Current behaviour | Question for Frasa |
| --- | --- | --- |
| Currencies | USD and AWG. One supplier-cost currency per shipment; each charge has its own currency; one reporting currency | Do any suppliers quote in another currency (EUR)? Are supplier currencies ever mixed on one shipment? |
| Exchange rate | One rate per estimate, entered as "AWG per 1 USD", required only when a conversion is needed, saved with the estimate | Which rate does Frasa cost with (bank selling rate, a fixed internal rate)? |
| Rounding | Each amount is converted to the reporting currency and rounded to the cent (half up). A shared charge is then split with the largest-remainder method so the parts add up exactly to the charge. Per-case and per-unit costs are the product total divided by cases or units, shown to 4 decimals | Is 4 decimals right for unit cost? |
| Allocation methods | By volume, weight, product value, case count, pallet count, manual split (amounts or percentages), or assigned to one product | Which method does Frasa use for ocean freight, insurance, handling, trucking? These can be saved as defaults |
| Volume and weight | Case dimensions in inches or centimetres, or volume per case in cubic feet or cubic metres; weight in pounds or kilograms. Required only for charges allocated that way | Does Frasa allocate freight by actual volume, or by chargeable (volumetric) weight? Chargeable weight is not implemented |
| Percentage charges (duties, taxes) | A rate applied per product to: product value plus whichever other charges the user selects (for example freight and insurance for a CIF-style basis). Can be limited to selected products. The basis is printed in the breakdown | **Frasa's actual duty and tax rules are not built in.** Which rates apply to which products, and on what basis? Are there charges calculated on a basis that includes other percentage charges? (Supported, but confirm.) |
| Different duty rates per product | Done by adding one percentage charge per rate and limiting each to its products | Would a tariff code per product with a rate table be worth adding later? |
| Number entry | Plain numbers with a decimal point. Numbers with thousands separators or decimal commas (`1,250` / `12,50`) are rejected rather than guessed. Money amounts take at most 2 decimals | Acceptable? |
| Saved estimates | Every save is a new version; versions cannot be edited or deleted. "Archive" hides an estimate from the list | Should anyone be able to delete an estimate outright? |
| Results trust | The server recalculates on save. A person with *edit* access is trusted with the content of estimates they save | Fine for Phase 1 |
| Selling price / margin | Not included. The calculator stops at landed cost | Wanted in a later phase? |

## Roles and department permissions

The full table is in [PLAN_AND_DATA_MODEL.md](PLAN_AND_DATA_MODEL.md#who-can-do-what). The choices
most worth a second look:

1. **Personal to-dos are private**, including from admins.
2. **Employees see all shared tasks of their own departments**, not only their own. They do not see
   other departments' tasks unless they own or created them.
3. **Employees cannot assign work to colleagues.** They can create shared tasks for themselves. Leads
   assign within their department. A lead can hand a task to *another* department by assigning it to
   that department's lead, who then reassigns it. Should employees be able to send requests to
   other departments directly?
4. **Admins do not automatically see freight estimates.** Access is granted per person and each
   change is audited.
5. **SOPs:** leads create, publish and archive their department's SOPs; company-wide SOPs are
   admin-only; a SOP's named owner can draft revisions but not publish. Published SOPs are readable
   by every employee, whatever their department. Should any SOP be restricted to one department?
6. **Acknowledgment audience** is the SOP's department members (everyone, for company-wide SOPs).
   Should a publisher be able to pick specific people?
7. **Everyone can see the staff directory** (names, emails, departments, roles) because it is needed
   to show owners and assign work.
8. **A person can belong to several departments** and lead more than one.
9. **Overdue escalation** goes to all leads of the task's department, or to admins when the
   department has no lead. It is sent once per task per due date, not repeated daily.

## Tasks and schedules

| Topic | Current behaviour | Question |
| --- | --- | --- |
| Deadlines | A date in Aruba time, no time of day. A task is overdue the day after its due date | Are times of day needed (e.g. container cut-off at 14:00)? |
| Working days | Daily recurring tasks can be limited to chosen weekdays. Weekly and monthly ones are not moved off weekends or public holidays | Which days does Frasa operate? Should Aruban public holidays be skipped? |
| Recurrence options | Every N days / weeks / months. No "first Monday of the month" style rules | Needed? |
| How early a recurring task appears | Daily: 1 day ahead; weekly: 7; monthly: 14 | Adjust? |
| Missed occurrences | If the scheduler was down, occurrences up to 7 days old are created late; older ones are skipped | OK? |
| Reminders | One in-app reminder per task per due date, from N days before. No email, SMS or WhatsApp in Phase 1 | Which channel matters most for the warehouse floor? |
| Deleting tasks | Leads and admins can delete shared tasks; "Cancel task" keeps the record and is the suggested route | Should deletion be admin-only? |
| Links to NECS / QuickBooks | A free-text label and optional web link per task | Do NECS and QuickBooks records have web addresses that can be linked, or only reference numbers? |

## Other

- **Language:** English only. Papiamento, Dutch or Spanish would need translation work.
- **Sign-in:** email and password, minimum 10 characters. Two-step verification is available in
  Supabase but not switched on; recommended for admins and anyone with freight access.
- **Phones:** the app is a responsive website, not an app-store app, and needs a connection.
- **File attachments:** up to 25 MB each, any type, no virus scanning.
- **Data location:** wherever the Supabase project is created.
- **Audit log:** covers role and access changes, department membership, settings, SOP publication
  and archiving, and freight estimate saves, duplicates and archiving. Task changes are recorded in
  each task's own history instead.
