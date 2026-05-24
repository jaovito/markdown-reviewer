import { describeError, isAppError } from "@/shared/ipc/errors";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("sync");

/**
 * Default `onError` handler for sync mutations. Without it, React Query
 * stores the failure on the mutation object and nothing reaches the user —
 * so a click on "Resolve" looks like it did nothing.
 *
 * For Phase 6 we surface the failure via `window.alert`; a toast component
 * is a follow-up. The error is also logged so it shows up in the dev
 * console for debugging.
 */
export function showMutationError(error: unknown) {
  log.error("sync mutation failed", error);
  const view = isAppError(error)
    ? describeError(error)
    : { title: "Something went wrong", description: String(error) };
  window.alert(`${view.title}\n\n${view.description}`);
}
