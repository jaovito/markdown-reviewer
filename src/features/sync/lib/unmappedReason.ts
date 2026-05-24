import type { RemoteThread } from "@/shared/ipc/contract";
import type { TFunction } from "i18next";

export function describeUnmappedReason(thread: RemoteThread, t: TFunction): string {
  const status = thread.mappingStatus;
  switch (status.kind) {
    case "fileMissing":
      return t("sync.unmapped.fileMissing", { path: thread.path });
    case "lineMoved":
      return t("sync.unmapped.lineMoved", {
        path: thread.path,
        line: thread.originalLine,
      });
    case "ambiguous":
      return t("sync.unmapped.ambiguous", { path: thread.path });
    case "outdated":
      return t("sync.unmapped.outdated");
    case "mapped":
      // Defensive: an unmapped thread should never report Mapped, but
      // returning a sensible message keeps the UI from crashing on stale
      // payloads.
      return t("sync.unmapped.outdated");
  }
}
