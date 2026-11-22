import PlayerView, { playerMetadata, playerStaticParams } from "@/views/Player";

export const dynamicParams = true;

export function generateStaticParams() {
  return playerStaticParams("br");
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return playerMetadata((await params).id, "br");
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  return <PlayerView id={(await params).id} region="br" />;
}
