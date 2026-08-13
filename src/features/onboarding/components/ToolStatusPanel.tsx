import type { ToolCheck, ToolStatus } from "@/shared/ipc/contract";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { useTranslation } from "react-i18next";

interface Props {
  status: ToolStatus | undefined;
  isLoading: boolean;
}

export function ToolStatusPanel({ status, isLoading }: Props) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("onboarding.environment.title")}</CardTitle>
        <CardDescription>{t("onboarding.environment.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Row label={t("onboarding.environment.git")} check={status?.git} loading={isLoading} />
        <Row label={t("onboarding.environment.githubCli")} check={status?.gh} loading={isLoading} />
        <Row
          label={t("onboarding.environment.githubAuth")}
          check={status?.ghAuth}
          loading={isLoading}
        />
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  check,
  loading,
}: {
  label: string;
  check: ToolCheck | undefined;
  loading: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-[hsl(var(--muted-foreground))]">
          {loading ? t("onboarding.environment.checking") : detailFor(check)}
        </div>
      </div>
      {loading ? (
        <Badge tone="muted">{t("onboarding.environment.checking")}</Badge>
      ) : check ? (
        <StatusBadge check={check} />
      ) : null}
    </div>
  );
}

function StatusBadge({ check }: { check: ToolCheck }) {
  const { t } = useTranslation();

  switch (check.state) {
    case "ok":
      return <Badge tone="success">{t("onboarding.environment.status.ok")}</Badge>;
    case "missing":
      return <Badge tone="destructive">{t("onboarding.environment.status.missing")}</Badge>;
    case "notAuthenticated":
      return <Badge tone="warning">{t("onboarding.environment.status.notAuthenticated")}</Badge>;
    case "error":
      return <Badge tone="destructive">{t("onboarding.environment.status.error")}</Badge>;
  }
}

function detailFor(check: ToolCheck | undefined): string {
  if (!check) return "";
  switch (check.state) {
    case "ok":
      return check.detail;
    case "missing":
    case "notAuthenticated":
      return check.hint;
    case "error":
      return check.message;
  }
}
