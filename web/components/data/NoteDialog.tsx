"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/** Note sur un joueur suivi (★) : liste partagée par tous les visiteurs */
export default function NoteDialog({
  player,
  onOpenChange,
  onSave,
  onRemove,
}: {
  player: { id: string; name: string; note?: string } | null;
  onOpenChange: (open: boolean) => void;
  onSave: (note: string) => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState("");
  useEffect(() => setText(player?.note ?? ""), [player]);
  return (
    <Dialog open={!!player} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Note sur {player?.name.replace(/\s*\(.*\)$/, "")}</DialogTitle>
          <DialogDescription>Visible par tous ceux qui ont l&apos;adresse du site (liste de suivi partagée).</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(text.trim());
          }}
        >
          <Textarea
            autoFocus
            maxLength={300}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ex : à revoir en soloQ, contrat fini en novembre, contact agent…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
            }}
          />
          <DialogFooter className="justify-between">
            <Button type="button" variant="destructive" size="sm" onClick={onRemove}>
              Ne plus suivre
            </Button>
            <span className="flex gap-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Annuler
                </Button>
              </DialogClose>
              <Button type="submit" variant="default">
                Enregistrer
              </Button>
            </span>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
