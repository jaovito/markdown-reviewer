import type { AppError } from "@/shared/ipc/contract";
import { describeError, isAppError } from "@/shared/ipc/errors";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  repoName: string;
  isOpen: boolean;
  isCloning: boolean;
  error: AppError | null;
  onCancel: () => void;
}

export function CloneProgressModal({ repoName, isOpen, isCloning, error, onCancel }: Props) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isCloning ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : null}
            {t("remoteRepos.cloneModal.title", { name: repoName })}
          </CardTitle>
          <CardDescription>
            {isCloning
              ? t("remoteRepos.cloneModal.cloningDescription", { name: repoName })
              : t("remoteRepos.cloneModal.selectFolder", { name: repoName })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && isAppError(error) ? (
            <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">
              <div className="font-semibold">{describeError(error).title}</div>
              <div>{describeError(error).description}</div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onCancel} disabled={isCloning}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
