import Donnees, { metadata as viewMetadata } from "@/views/Donnees";

export const metadata = viewMetadata;

export default function Page() {
  return <Donnees region="lcp" />;
}
