import type { MechanicRequest } from "@workspace/db";
import type { Analysis } from "./structured-effects";

/**
 * Server-only boundary for a future coding agent. This phase deliberately
 * supplies no configured provider and callers must opt in explicitly later.
 */
export type MechanicRequestContext = Pick<
  MechanicRequest,
  "id" | "originalCardText" | "unsupportedParts" | "requestedBy"
> & {
  analysisResult: Analysis;
};

export interface CodingAgentGateway {
  analyzeOrGenerate(context: MechanicRequestContext): Promise<void>;
}

/**
 * Intentionally inert implementation. It does not inspect configuration,
 * contact a provider, start a process, or make repository changes.
 */
export class DisabledCodingAgentGateway implements CodingAgentGateway {
  async analyzeOrGenerate(_context: MechanicRequestContext): Promise<void> {
    throw new Error("Coding agent integration is disabled and unconfigured.");
  }
}

export const disabledCodingAgentGateway: CodingAgentGateway =
  new DisabledCodingAgentGateway();

// Compatibility aliases while this server-only boundary is introduced.
export type CodingAgentPort = CodingAgentGateway;
export const DisabledCodingAgentPort = DisabledCodingAgentGateway;
export const disabledCodingAgentPort = disabledCodingAgentGateway;