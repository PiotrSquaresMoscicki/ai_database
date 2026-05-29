import { Logging } from "@google-cloud/logging";

/**
 * Shared Cloud Logging setup. Every backend module logs through the same
 * `LogSync` instance so structured JSON logs land in a single "app" log on
 * Cloud Run. See .github/copilot-instructions.md (Logging) for why we log
 * verbosely and use `@google-cloud/logging` `LogSync` directly.
 */
export const GCP_PROJECT =
  process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || "";

const logging = new Logging({ projectId: GCP_PROJECT || undefined });

export const log = logging.logSync("app");
