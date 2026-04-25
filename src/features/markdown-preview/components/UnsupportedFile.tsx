import { FileXIcon } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

export function UnsupportedFile({ path }: { path: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
      <FileXIcon className="size-8 opacity-60" />
      <p>
        <Trans
          i18nKey="fileExplorer.preview.unsupportedTitle"
          values={{ path }}
          components={{
            code: (
              <code className="rounded bg-[hsl(var(--muted))] px-1 py-0.5 text-xs">{path}</code>
            ),
          }}
        />
      </p>
      <p className="text-xs opacity-80">{t("fileExplorer.preview.unsupportedDescription")}</p>
    </div>
  );
}
