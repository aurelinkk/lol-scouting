import SheetView, { sheetMetadata } from "@/views/Sheet";

// Générée à la demande (pas au build : une fiche par joueur doublerait le temps de build)
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return sheetMetadata((await params).id, "br");
}

export default async function SheetPage({ params }: { params: Promise<{ id: string }> }) {
  return <SheetView id={(await params).id} region="br" />;
}
