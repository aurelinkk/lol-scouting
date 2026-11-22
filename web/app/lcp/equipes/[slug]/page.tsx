import TeamView, { teamMetadata, teamStaticParams } from "@/views/Team";

export const dynamicParams = true;

export function generateStaticParams() {
  return teamStaticParams("lcp");
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return teamMetadata((await params).slug, "lcp");
}

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  return <TeamView slug={(await params).slug} region="lcp" />;
}
