import { tagLabel, useTagLabels } from "@/lib/tag-labels";
export function TagLabel({ tag }: { tag: string }) {
  const labels = useTagLabels();
  return <>{tagLabel(tag, labels)}</>;
}
