"use client";

import { useEffect, useRef, useState } from "react";

/** Petits contrôles de la barre de filtres de l'onglet Données */

const base =
  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] leading-none transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const off = "border-border bg-surface text-ink-2 hover:border-ink-3 hover:text-ink";
const on = "border-accent bg-accent-soft font-medium text-ink";

/** Groupe de boutons à choix unique (ex : postes) */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-border bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-7 rounded-full px-3 text-[13px] transition-colors ${
            value === o.value ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-2 hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Interrupteur en forme de pastille (filtre oui / non) */
export function ToggleChip({
  checked,
  onChange,
  children,
  title,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button type="button" aria-pressed={checked} title={title} onClick={() => onChange(!checked)} className={`${base} ${checked ? on : off}`}>
      <span
        aria-hidden
        className={`grid h-3.5 w-3.5 place-items-center rounded-full border text-[9px] ${
          checked ? "border-accent bg-accent text-white" : "border-ink-3"
        }`}
      >
        {checked ? "✓" : ""}
      </span>
      {children}
    </button>
  );
}

/** Liste déroulante habillée en pastille : « Ligue : LFL ▾ » */
export function SelectChip({
  label,
  value,
  options,
  onChange,
  allLabel = "Toutes",
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  allLabel?: string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <label className={`${base} ${value ? on : off} relative cursor-pointer pr-7`}>
      <span className="text-ink-3">{label}</span>
      <span>{current ? current.label : allLabel}</span>
      <span aria-hidden className="pointer-events-none absolute right-2.5 text-[10px] text-ink-3">
        ▾
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Nombre en pastille : « Âge max [21] » ; vide = pas de filtre */
export function NumberChip({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  placeholder = "–",
  suffix,
  defaultValue = null,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min: number;
  max: number;
  step?: number;
  placeholder?: string;
  suffix?: string;
  /** valeur par défaut : affichée sans mise en avant */
  defaultValue?: number | null;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => setText(value === null ? "" : String(value)), [value]);
  return (
    <label className={`${base} ${value !== null && value !== defaultValue ? on : off} cursor-text`}>
      <span className="text-ink-3">{label}</span>
      <input
        inputMode="decimal"
        aria-label={label}
        className="w-9 bg-transparent text-center outline-none placeholder:text-ink-3"
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value.replace(",", "."));
          if (e.target.value.trim() === "") onChange(null);
          else if (Number.isFinite(n) && n >= min && n <= max) onChange(Math.round(n / step) * step);
        }}
      />
      {suffix && <span className="text-ink-3">{suffix}</span>}
    </label>
  );
}

/** Menu déroulant simple (bouton + panneau), fermé au clic extérieur ou Échap */
export function Menu({
  label,
  children,
  align = "right",
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`${base} ${open ? on : off}`}>
        {label}
      </button>
      {open && (
        <div
          className={`absolute z-30 mt-1.5 w-64 rounded-xl border border-border bg-surface p-2 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Bouton discret (actions : copier le lien, réinitialiser) */
export function GhostButton({
  onClick,
  children,
  title,
}: {
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button type="button" title={title} onClick={onClick} className={`${base} ${off}`}>
      {children}
    </button>
  );
}
