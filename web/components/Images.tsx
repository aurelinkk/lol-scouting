"use client";
/* eslint-disable @next/next/no-img-element */
// Photos et logos chargés directement depuis le CDN de Leaguepedia.
// Si une image ne charge pas, on affiche les initiales / un carré neutre.

import { useEffect, useRef, useState } from "react";

/** Détecte aussi les images qui ont échoué avant l'hydratation de React. */
function useImageFallback() {
  const ref = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  return { ref, failed, onError: () => setFailed(true) };
}

function initials(name: string) {
  const clean = name.replace(/\s*\(.*\)$/, "");
  return clean.slice(0, 2).toUpperCase();
}

export function Avatar({ name, src, size = 40 }: { name: string; src?: string; size?: number }) {
  const { ref, failed, onError } = useImageFallback();
  const style = { width: size, height: size, fontSize: Math.max(11, size / 3) };
  if (!src || failed) {
    return (
      <div
        style={style}
        className="flex shrink-0 items-center justify-center rounded-full bg-surface-2 font-semibold text-ink-2"
        aria-hidden
      >
        {initials(name)}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      style={style}
      loading="lazy"
      referrerPolicy="no-referrer"
      ref={ref}
      onError={onError}
      className="shrink-0 rounded-full bg-surface-2 object-cover object-top"
    />
  );
}

export function TeamLogo({ team, src, size = 20 }: { team: string; src?: string; size?: number }) {
  const { ref, failed, onError } = useImageFallback();
  if (!src || failed) {
    return (
      <span
        style={{ width: size, height: size }}
        className="inline-block shrink-0 rounded bg-surface-2"
        title={team}
        aria-hidden
      />
    );
  }
  return (
    <img
      src={src}
      alt={team}
      title={team}
      style={{ width: size, height: size }}
      loading="lazy"
      referrerPolicy="no-referrer"
      ref={ref}
      onError={onError}
      className="inline-block shrink-0 object-contain"
    />
  );
}

export function PlayerName({ name }: { name: string }) {
  // "Koala (Alexis Gonzalez)" -> pseudo en gras, nom réel en discret
  const m = name.match(/^(.*?)\s*\((.*)\)$/);
  if (!m) return <span className="font-semibold">{name}</span>;
  return (
    <span>
      <span className="font-semibold">{m[1]}</span>{" "}
      <span className="text-ink-3 font-normal">({m[2]})</span>
    </span>
  );
}
