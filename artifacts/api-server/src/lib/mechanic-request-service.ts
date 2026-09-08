import type { NewMechanicRequest } from "@workspace/db";
import {
  analyzeEffectText,
  effectLibrary,
  type Analysis,
} from "./structured-effects";

export type MechanicRequestPreparation =
  | { kind: "ready"; values: NewMechanicRequest; analysis: Analysis }
  | { kind: "supported"; analysis: Analysis }
  | { kind: "analysis_failure"; analysis: Analysis };

export function isPendingMechanicRequestConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export function prepareMechanicRequest(
  originalCardText: string,
  requestedBy: string,
  id: string,
  analyze: (text: string) => Analysis = analyzeEffectText,
): MechanicRequestPreparation {
  // Keep the decision anchored to the currently deployed shared library.
  void effectLibrary();
  const analysis = analyze(originalCardText);
  if (analysis.outcome === "supported") return { kind: "supported", analysis };
  if (analysis.outcome === "analysis_failure") {
    return { kind: "analysis_failure", analysis };
  }
  return {
    kind: "ready",
    analysis,
    values: {
      id,
      status: "PENDING",
      originalCardText,
      analysisResult: analysis,
      unsupportedParts: analysis.unsupportedSegments,
      requestedBy,
    },
  };
}