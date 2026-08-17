import { i18next } from "@/shared/i18n";
import { relaunch } from "@tauri-apps/plugin-process";
import { type Update, check } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useState } from "react";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "up-to-date"
  | "error";

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  body?: string;
  date?: string;
}

const isTauriEnv =
  typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

export function useAutoUpdater(autoCheck = false) {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updateHandle, setUpdateHandle] = useState<Update | null>(null);

  const checkForUpdates = useCallback(async () => {
    if (!isTauriEnv) {
      setStatus("idle");
      return false;
    }

    try {
      setStatus("checking");

      setErrorMessage(null);

      const update = await check();

      if (update) {
        setUpdateHandle(update);
        setUpdateInfo({
          version: update.version,
          currentVersion: update.currentVersion,
          body: update.body,
          date: update.date,
        });
        setStatus("available");
        return true;
      }

      setUpdateHandle(null);
      setUpdateInfo(null);
      setStatus("up-to-date");
      return false;
    } catch (err) {
      console.error("Error checking for updates:", err);
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus("error");
      return false;
    }
  }, []);

  const downloadAndInstallUpdate = useCallback(async () => {
    if (!updateHandle) return;

    try {
      setStatus("downloading");
      setProgressPercent(0);
      setErrorMessage(null);

      let downloaded = 0;
      let totalLength = 0;

      await updateHandle.downloadAndInstall((event) => {
        if (event.event === "Started") {
          totalLength = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (totalLength > 0) {
            setProgressPercent(Math.min(Math.round((downloaded / totalLength) * 100), 100));
          }
        } else if (event.event === "Finished") {
          setProgressPercent(100);
        }
      });

      setStatus("ready");
    } catch (err) {
      console.error("Error downloading/installing update:", err);
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [updateHandle]);

  const relaunchApp = useCallback(async () => {
    try {
      await relaunch();
    } catch (err) {
      console.error("Error relaunching app:", err);
      setErrorMessage(
        err instanceof Error ? err.message : i18next.t("updater.error.restartFailed"),
      );
      setStatus("error");
    }
  }, []);

  const dismiss = useCallback(() => {
    setStatus("idle");
    setErrorMessage(null);
  }, []);

  useEffect(() => {
    if (autoCheck) {
      void checkForUpdates();
    }
  }, [autoCheck, checkForUpdates]);

  return {
    status,
    updateInfo,
    progressPercent,
    errorMessage,
    checkForUpdates,
    downloadAndInstallUpdate,
    relaunchApp,
    dismiss,
  };
}
