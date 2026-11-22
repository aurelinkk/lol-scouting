"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeftIcon, PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Region } from "@/lib/region";
import { useWatchlist } from "@/lib/useWatchlist";

/** Barre d'outils de la fiche (pas imprimée) */
export function SheetToolbar({ back }: { back: string }) {
  return (
    <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-2 print:hidden">
      <Link href={back} className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeftIcon className="size-4" /> Fiche joueur
      </Link>
      <span className="ml-auto text-xs text-ink-3">Format A4 · dans la fenêtre d&apos;impression, choisir « Enregistrer au format PDF »</span>
      <Button onClick={() => window.print()}>
        <PrinterIcon /> Télécharger en PDF
      </Button>
    </div>
  );
}

/** Notes du scout : modifiables à l'écran, imprimées telles quelles */
export function ScoutNotes({ region, id }: { region: Region; id: string }) {
  const key = `fiche-note-${region}-${id}`;
  const watch = useWatchlist(region);
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(key);
    } catch {}
    if (saved !== null) setText(saved);
    setLoaded(true);
  }, [key]);
  // Note de la liste de suivi ⭐ si rien n'a encore été écrit sur la fiche
  const watchNote = watch.list[id]?.note;
  useEffect(() => {
    if (loaded && !text && watchNote) setText(watchNote);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, watchNote]);
  const save = (v: string) => {
    setText(v);
    try {
      localStorage.setItem(key, v);
    } catch {}
  };
  return (
    <>
      <textarea
        value={text}
        onChange={(e) => save(e.target.value)}
        placeholder="Avis du scout, contexte, points à vérifier en vidéo… (gardé dans ce navigateur, imprimé avec la fiche)"
        className="min-h-24 w-full resize-y rounded-md border border-border bg-transparent p-2 text-[12px] leading-snug outline-none focus:border-accent print:hidden"
      />
      <div className="hidden min-h-16 whitespace-pre-wrap text-[11px] leading-snug print:block">
        {text || "—"}
      </div>
    </>
  );
}
