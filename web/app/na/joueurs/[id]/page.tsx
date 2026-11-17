import PlayerView, { playerMetadata, playerStaticParams } from "@/views/Player";

export const dynamicParams = true;

export function generateStaticParams() {
  return playerStaticParams("na");
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return playerMetadata((await params).id, "na");
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  return <PlayerView id={(await params).id} region="na" />;
}
