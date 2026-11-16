"use client";

import { useState } from "react";

type Dept = { id: string; name: string };

/** Role, freight access and department membership fields shared by invite and edit. */
export function UserFields({
  departments,
  values,
}: {
  departments: Dept[];
  values: { full_name: string; role: string; freight_access: string; memberships: { department_id: string; is_lead: boolean }[] };
}) {
  const [role, setRole] = useState(values.role);
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="label">Full name</span>
        <input className="input" name="full_name" defaultValue={values.full_name} required maxLength={120} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Role</span>
          <select className="input" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="employee">Employee</option>
            <option value="department_lead">Department lead</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Freight estimates (supplier costs)</span>
          <select className="input" name="freight_access" defaultValue={values.freight_access}>
            <option value="none">No access</option>
            <option value="view">View and export</option>
            <option value="edit">View, create and edit</option>
          </select>
          <span className="hint block">Separate from role. Admins also need it granted here.</span>
        </label>
      </div>
      <fieldset>
        <legend className="label">Departments</legend>
        <div className="divide-y divide-line rounded-lg border border-line bg-white">
          {departments.map((d) => {
            const m = values.memberships.find((x) => x.department_id === d.id);
            return (
              <div key={d.id} className="flex min-h-11 items-center gap-4 px-3">
                <label className="flex flex-1 items-center gap-2 py-2 text-sm">
                  <input type="checkbox" name={`dept_${d.id}`} defaultChecked={!!m} /> {d.name}
                </label>
                {role === "department_lead" ? (
                  <label className="flex items-center gap-2 py-2 text-sm text-muted">
                    <input type="checkbox" name={`lead_${d.id}`} defaultChecked={!!m?.is_lead} /> Leads it
                  </label>
                ) : null}
              </div>
            );
          })}
        </div>
        <span className="hint block">
          {role === "department_lead"
            ? "A lead can see and assign work, and publish SOPs, only in the departments marked “Leads it”."
            : "Members see their departments' shared tasks and SOP updates."}
        </span>
      </fieldset>
    </div>
  );
}
