import type { Repository } from "@/shared/ipc/contract";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/shared/ui/card";
import { useTranslation } from "react-i18next";

interface Props {
  repo: Repository;
  onClear: () => void;
}

export function RepoValidationCard({ repo, onClear }: Props) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>
            {repo.owner}/{repo.repo}
          </span>
          <Badge tone="success">{t("onboarding.validation.ready")}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <Row k={t("onboarding.validation.path")} v={repo.path} />
        <Row k={t("onboarding.validation.remote")} v={repo.remoteUrl} />
        <Row
          k={t("onboarding.validation.branch")}
          v={repo.currentBranch ?? t("onboarding.validation.detachedHead")}
        />
      </CardContent>
      <CardFooter>
        <Button variant="outline" size="sm" onClick={onClear}>
          {t("onboarding.validation.chooseDifferentFolder")}
        </Button>
        <Button size="sm" disabled title={t("onboarding.validation.continueUnavailable")}>
          {t("onboarding.validation.continue")}
        </Button>
      </CardFooter>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <div className="w-20 text-[hsl(var(--muted-foreground))]">{k}</div>
      <div className="font-mono text-xs break-all">{v}</div>
    </div>
  );
}
