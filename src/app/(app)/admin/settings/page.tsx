import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Notice, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveFreightDefaults, saveNotificationDefaults } from "@/modules/admin/actions";
import { ALLOCATION_LABELS, ALLOCATION_METHODS } from "@/modules/freight/types";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("key, value");
  const get = <T,>(key: string) => (data?.find((s) => s.key === key)?.value ?? {}) as T;
  const notif = get<{ remind_days_before?: number; escalate_overdue?: boolean }>("notification_defaults");
  const freight = get<{ usd_to_awg_rate?: string | number | null; charge_templates?: { name: string; allocation: string }[] }>("freight_defaults");
  // Only shared-charge methods make sense in a template (not "manual" or "direct").
  const templateMethods = ALLOCATION_METHODS.filter((m) => !m.startsWith("manual") && m !== "direct");

  return (
    <>
      <PageHeader title="Settings" subtitle="Company-wide defaults. Changes are recorded in the audit log." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Notification defaults">
          <ActionForm action={saveNotificationDefaults} className="space-y-4">
            <label className="block sm:max-w-xs">
              <span className="label">Remind owners (days before the due date)</span>
              <input className="input" type="number" name="remind_days_before" min={0} max={30} defaultValue={notif.remind_days_before ?? 1} required />
              <span className="hint block">0 = on the due date. Used by tasks that do not set their own value.</span>
            </label>
            <label className="flex min-h-10 items-start gap-2 text-sm">
              <input type="checkbox" name="escalate_overdue" defaultChecked={notif.escalate_overdue ?? true} className="mt-1" />
              <span>
                <span className="font-semibold">New shared tasks escalate when overdue</span>
                <span className="block text-xs text-muted">Pre-ticks “Escalate when overdue” on new shared tasks. It can be changed per task.</span>
              </span>
            </label>
            <p className="text-xs text-muted">Phase 1 sends notifications inside Frasa HQ only (no email or WhatsApp).</p>
            <SubmitButton>Save notification defaults</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Freight calculator defaults">
          <div className="mb-4">
            <Notice tone="amber">
              Frasa HQ does not assume any rate. These values only pre-fill <em>new</em> estimates and can be changed on each one. Saved estimates keep the values they were saved with.
            </Notice>
          </div>
          <ActionForm action={saveFreightDefaults} className="space-y-4">
            <input type="hidden" name="allowed_allocations" value={templateMethods.join(",")} />
            <label className="block sm:max-w-xs">
              <span className="label">Default exchange rate (AWG per 1 USD)</span>
              <input className="input" name="usd_to_awg_rate" inputMode="decimal" defaultValue={freight.usd_to_awg_rate ?? ""} placeholder="Not set" />
              <span className="hint block">Leave blank to make each estimate ask for it.</span>
            </label>
            <label className="block">
              <span className="label">Usual shipment charges</span>
              <textarea
                className="input font-mono text-[13px]"
                name="charge_templates"
                rows={7}
                defaultValue={(freight.charge_templates ?? []).map((t) => (t.allocation ? `${t.name} | ${t.allocation}` : t.name)).join("\n")}
                placeholder={"Ocean freight | volume\nInsurance | value"}
              />
              <span className="hint block">
                One charge per line: <code>Name | allocation method</code>. Amounts are never pre-filled. Methods:{" "}
                {templateMethods.map((m) => `${m} (${ALLOCATION_LABELS[m]})`).join(", ")}.
              </span>
            </label>
            <SubmitButton>Save freight defaults</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
