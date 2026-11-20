import Besoins, { metadata as viewMetadata } from "@/views/Besoins";

export const metadata = viewMetadata;

export default function Page() {
  return <Besoins region="eu" />;
}
