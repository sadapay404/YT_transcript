import type { AiProviderChoice, AiProviderId, AiProviderStatus } from "@/lib/types";

/**
 * Provider order for a request. "auto" leads with Gemini (long context, best
 * clip quality) and keeps Groq as the fast backup; a manual choice leads with
 * that provider but still falls back, so one busy free tier never means no
 * answer. Providers without a key are skipped.
 */
export function providerOrder(
  choice: AiProviderChoice,
  configured: AiProviderStatus,
): AiProviderId[] {
  const preferred: AiProviderId[] = choice === "groq" ? ["groq", "gemini"] : ["gemini", "groq"];
  return preferred.filter((provider) => configured[provider]);
}
