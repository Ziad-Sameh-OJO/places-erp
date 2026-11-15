"use client";

/**
 * 14.6 · «السيلز»: several people ticked at once (checkboxes in a dropdown); the value is the ids joined by commas,
 * as the API's `assignedToId` reads them.
 */
export function MultiPick({ label, all, picked, options, onChange }: {
  label: string; all: string; picked: string; options: { id: string; name: string }[]; onChange: (v: string) => void;
}) {
  const ids = picked ? picked.split(",") : [];
  const names = options.filter((o) => ids.includes(o.id)).map((o) => o.name);
  const toggle = (id: string, on: boolean) => onChange((on ? [...ids, id] : ids.filter((x) => x !== id)).join(","));
  return (
    <details className="multi-pick">
      <summary aria-label={label}>{names.length === 0 ? all : names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`}</summary>
      <div className="multi-pick-list" role="group" aria-label={label}>
        {options.map((o) => (
          <label key={o.id}><input type="checkbox" checked={ids.includes(o.id)} onChange={(e) => toggle(o.id, e.target.checked)} />{o.name}</label>
        ))}
      </div>
    </details>
  );
}
