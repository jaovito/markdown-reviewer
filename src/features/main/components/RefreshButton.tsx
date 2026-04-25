import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface RefreshButtonProps {
  /**
   * Optional list of query-key prefixes to invalidate. Defaults to the
   * Phase 2 surface: PR list/detail, changed files, file content, file diff.
   */
  keys?: string[];
}

const DEFAULT_KEYS = [
  "pull-requests",
  "pull-request",
  "changed-files",
  "file-content",
  "file-diff",
];

export function RefreshButton({ keys = DEFAULT_KEYS }: RefreshButtonProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [spinning, setSpinning] = useState(false);

  const handleClick = async () => {
    setSpinning(true);
    try {
      await Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
    } finally {
      // Keep the spin visible briefly even if the network is fast — gives
      // the user feedback that the click registered.
      setTimeout(() => setSpinning(false), 400);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t("app.actions.refreshAria")}
          onClick={handleClick}
          className="size-8"
        >
          <RefreshCwIcon className={cn("size-3.5", spinning && "animate-spin")} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{t("app.actions.refresh")}</TooltipContent>
    </Tooltip>
  );
}
