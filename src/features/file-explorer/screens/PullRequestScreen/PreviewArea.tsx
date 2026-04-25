import {
  MarkdownPreview,
  UnsupportedFile,
  useFileContent,
  useFileDiff,
} from "@/features/markdown-preview";
import { describeError } from "@/shared/ipc/errors";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { useTranslation } from "react-i18next";
import { isMarkdownPath } from "../../lib/buildTree";
import { PreviewSkeleton } from "./skeleton";

interface PreviewAreaProps {
  repoPath: string | undefined;
  sha: string | undefined;
  filePath: string;
  isDetailLoading: boolean;
  prNumber: number;
}

export function PreviewArea({
  repoPath,
  sha,
  filePath,
  isDetailLoading,
  prNumber,
}: PreviewAreaProps) {
  const { t } = useTranslation();
  const supported = isMarkdownPath(filePath);
  const file = useFileContent({
    repoPath,
    sha,
    filePath: supported ? filePath : undefined,
  });
  const diff = useFileDiff({
    repoPath,
    prNumber,
    filePath: supported ? filePath : undefined,
  });

  if (!supported) return <UnsupportedFile path={filePath} />;
  if (isDetailLoading || file.isLoading) return <PreviewSkeleton />;

  if (file.error) {
    const view = describeError(file.error);
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <Alert tone="destructive">
          <AlertTitle>{view.title}</AlertTitle>
          <AlertDescription>{view.description}</AlertDescription>
          {view.actionHint ? (
            <AlertDescription className="mt-1 text-xs">{view.actionHint}</AlertDescription>
          ) : null}
        </Alert>
        <Button onClick={() => file.refetch()} size="sm" variant="outline" className="mt-3">
          {t("app.actions.retry")}
        </Button>
      </div>
    );
  }
  return (
    <MarkdownPreview
      source={file.data ?? ""}
      hunks={diff.data?.hunks}
      prNumber={prNumber}
      filePath={filePath}
      headSha={sha}
    />
  );
}
