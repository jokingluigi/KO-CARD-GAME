export type NoticePolicyRecord = {
  id: string;
  title: string;
  body: string;
  displayOrder: number;
  enabled: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type MainMediaPolicyRecord = {
  id: string;
  titleEnabled: boolean;
  /** Legacy fallback for rows created before titleEnabled existed. */
  mainEnabled?: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export function validateNoticeInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  const displayOrderValue = input.displayOrder === undefined ? 0 : input.displayOrder;
  const enabled = input.enabled === undefined ? true : input.enabled;
  if (
    !title ||
    title.length > 120 ||
    !body ||
    body.length > 4000 ||
    typeof displayOrderValue !== "number" ||
    !Number.isSafeInteger(displayOrderValue) ||
    displayOrderValue < -100_000 ||
    displayOrderValue > 100_000 ||
    typeof enabled !== "boolean"
  ) {
    return null;
  }
  return { title, body, displayOrder: displayOrderValue, enabled };
}

export function filterAndSortPublicNotices<T extends NoticePolicyRecord>(notices: T[]): T[] {
  return notices
    .filter((notice) => notice.enabled)
    .sort((left, right) => {
      if (left.displayOrder !== right.displayOrder) return right.displayOrder - left.displayOrder;
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
}

export function selectActiveMainMedia<T extends MainMediaPolicyRecord>(media: T[]): T | null {
  return media
    .filter((item) => item.titleEnabled || item.mainEnabled === true)
    .sort((left, right) => {
      const updated = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      return updated || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    })[0] ?? null;
}