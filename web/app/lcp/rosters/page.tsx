import Rosters, { metadata as viewMetadata } from "@/views/Rosters";

export const metadata = viewMetadata;

export default function Page() {
  return <Rosters region="lcp" />;
}
