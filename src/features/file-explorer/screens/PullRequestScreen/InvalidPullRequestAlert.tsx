import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { useTranslation } from "react-i18next";

interface InvalidPullRequestAlertProps {
  value: string;
}

export function InvalidPullRequestAlert({ value }: InvalidPullRequestAlertProps) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-md px-6 py-8">
      <Alert tone="destructive">
        <AlertTitle>{t("fileExplorer.invalidPrNumber.title")}</AlertTitle>
        <AlertDescription>
          {t("fileExplorer.invalidPrNumber.description", { value })}
        </AlertDescription>
      </Alert>
    </div>
  );
}
