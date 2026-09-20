import { z } from "zod";

/** Canonical card tags accepted by card create/update APIs. */
export const cardTagsSchema = z
  .array(z.string())
  .max(3)
  .transform((tags) => tags.map((tag) => tag.trim()))
  .superRefine((tags, context) => {
    if (tags.some((tag) => tag.length === 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Card tags must not be blank.",
      });
    }
    if (new Set(tags).size !== tags.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Card tags must be unique.",
      });
    }
  });

export function parseCardTags(value: unknown): string[] | null {
  if (value === undefined) return [];
  const parsed = cardTagsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}