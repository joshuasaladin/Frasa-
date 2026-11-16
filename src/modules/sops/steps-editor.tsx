"use client";

import { useState } from "react";
import type { SopLink, SopStep } from "./types";

type Keyed<T> = T & { key: number };
let nextKey = 1;
const keyed = <T,>(items: T[]): Keyed<T>[] => items.map((i) => ({ ...i, key: nextKey++ }));

/** Step-by-step instructions; posted as JSON in a hidden `steps` field. */
export function StepsEditor({ initial }: { initial: SopStep[] }) {
  const [steps, setSteps] = useState<Keyed<SopStep>[]>(() =>
    keyed(initial.length > 0 ? initial : [{ title: "", detail: "" }]),
  );
  const update = (key: number, patch: Partial<SopStep>) =>
    setSteps((s) => s.map((st) => (st.key === key ? { ...st, ...patch } : st)));
  const move = (index: number, by: number) =>
    setSteps((s) => {
      const target = index + by;
      if (target < 0 || target >= s.length) return s;
      const copy = [...s];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });

  return (
    <div>
      <input type="hidden" name="steps" value={JSON.stringify(steps.map(({ title, detail }) => ({ title, detail })))} />
      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li key={step.key} className="rounded-lg border border-line bg-paper/60 p-3">
            <div className="flex items-start gap-3">
              <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest-900 text-sm font-bold text-white">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  className="input font-semibold"
                  placeholder="What to do"
                  aria-label={`Step ${index + 1} title`}
                  maxLength={200}
                  value={step.title}
                  onChange={(e) => update(step.key, { title: e.target.value })}
                />
                <textarea
                  className="input"
                  rows={3}
                  placeholder="How to do it, and what to check"
                  aria-label={`Step ${index + 1} detail`}
                  maxLength={5000}
                  value={step.detail}
                  onChange={(e) => update(step.key, { detail: e.target.value })}
                />
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-sm" disabled={index === 0} onClick={() => move(index, -1)}>
                    ↑ Move up
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={index === steps.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓ Move down
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => setSteps((s) => s.filter((st) => st.key !== step.key))}
                  >
                    Remove step
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn mt-3"
        onClick={() => setSteps((s) => [...s, { title: "", detail: "", key: nextKey++ }])}
      >
        + Add step
      </button>
    </div>
  );
}

/** Reference links; posted as JSON in a hidden `links` field. */
export function LinksEditor({ initial }: { initial: SopLink[] }) {
  const [links, setLinks] = useState<Keyed<SopLink>[]>(() => keyed(initial));
  const update = (key: number, patch: Partial<SopLink>) =>
    setLinks((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  // Rows left completely empty are not submitted.
  const payload = links
    .filter((l) => l.label.trim() !== "" || l.url.trim() !== "")
    .map(({ label, url }) => ({ label, url }));

  return (
    <div>
      <input type="hidden" name="links" value={JSON.stringify(payload)} />
      {links.length === 0 ? <p className="text-sm text-muted">No links yet.</p> : null}
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.key} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
            <input
              className="input"
              placeholder="Label, e.g. NECS item lookup"
              aria-label="Link label"
              maxLength={200}
              value={link.label}
              onChange={(e) => update(link.key, { label: e.target.value })}
            />
            <input
              className="input"
              type="url"
              inputMode="url"
              placeholder="https://"
              aria-label="Link address"
              maxLength={2000}
              value={link.url}
              onChange={(e) => update(link.key, { url: e.target.value })}
            />
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setLinks((l) => l.filter((x) => x.key !== link.key))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn mt-3"
        onClick={() => setLinks((l) => [...l, { label: "", url: "", key: nextKey++ }])}
      >
        + Add link
      </button>
    </div>
  );
}
