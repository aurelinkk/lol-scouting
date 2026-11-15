import Link from "next/link";
import { TeamLogo } from "@/components/Images";
import RostersBrowser from "@/components/RostersBrowser";
import { getMercato, type MercatoSlot } from "@/lib/data";

export const metadata = { title: "Rosters · LoL Scouting" };

function Slot({ slot }: { slot: MercatoSlot }) {
  const before = slot.before?.name ?? "";
  const after = slot.after?.name ?? "";
  const unchanged = before && after && before === after;
  const name = (s: MercatoSlot["after"], strong: boolean) =>
    s?.id ? (
      <Link href={`/joueurs/${s.id}`} className={`hover:underline ${strong ? "font-semibold" : ""}`}>
        {s.name}
      </Link>
    ) : (
      <span className={strong ? "font-semibold" : ""}>{s?.name}</span>
    );
  return (
    <li className="grid grid-cols-[3.75rem_minmax(0,1fr)_0.75rem_minmax(0,1fr)] items-center gap-2 px-3 py-1.5 text-sm">
      <span className="text-[11px] uppercase tracking-wide text-ink-3">{slot.role}</span>
      <span className="truncate text-ink-2" title={before}>
        {before || "—"}
      </span>
      <span className="text-center text-ink-3">→</span>
      <span className={`truncate text-right ${unchanged ? "text-ink-3" : ""}`} title={after}>
        {after ? name(slot.after, !unchanged) : <span className="text-ink-3">—</span>}
      </span>
    </li>
  );
}

export default function RostersPage() {
  const mercato = getMercato();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Rosters</h1>
        <p className="text-sm text-ink-2">
          Effectifs de la LEC et des ERL1 depuis 2023, d&apos;après les parties jouées, et le mercato de la saison à
          venir.
        </p>
      </div>

      {mercato && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Mercato {mercato.season}</h2>
            <p className="text-xs text-ink-3">
              Saisi à la main dans <code>rosters_{mercato.season}.csv</code> (en gras : nouveaux joueurs, gris : inchangé,
              — : pas encore annoncé). Sert aussi aux montées {mercato.season - 1} → {mercato.season}.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {mercato.teams.map((t) => (
              <div key={t.team} className="overflow-hidden rounded-lg border border-border bg-surface">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                  <TeamLogo team={t.team} src={t.logo} size={22} />
                  <span className="truncate text-sm font-semibold">{t.team}</span>
                  <span className="ml-auto text-[10px] text-ink-3">{t.league}</span>
                </div>
                <ul className="divide-y divide-border">
                  {t.slots.map((s) => (
                    <Slot key={s.role} slot={s} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Effectifs par saison</h2>
        <RostersBrowser />
      </section>
    </div>
  );
}
