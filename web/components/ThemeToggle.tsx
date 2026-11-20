"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useEffect, useState } from "react";

/** Bouton thème sombre (par défaut) / clair, mémorisé dans ce navigateur */
export default function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => setLight(document.documentElement.dataset.theme === "light"), []);
  const toggle = () => {
    const next = !light;
    setLight(next);
    if (next) document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("theme", next ? "light" : "dark");
    } catch {}
  };
  return (
    <button
      type="button"
      onClick={toggle}
      title={light ? "Passer en thème sombre" : "Passer en thème clair"}
      aria-label={light ? "Passer en thème sombre" : "Passer en thème clair"}
      className="grid size-8 shrink-0 place-items-center rounded-full border border-border text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
    >
      {light ? <MoonIcon className="size-4" /> : <SunIcon className="size-4" />}
    </button>
  );
}
