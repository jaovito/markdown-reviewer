import type { AppError } from "@/shared/ipc/contract";
import { describeError } from "@/shared/ipc/errors";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";

export function ErrorAlert({ error }: { error: AppError }) {
  const view = describeError(error);
  return (
    <Alert tone="destructive">
      <div>
        <AlertTitle>{view.title}</AlertTitle>
        <AlertDescription>{view.description}</AlertDescription>
        {view.actionHint ? (
          <AlertDescription className="mt-1 text-xs">{view.actionHint}</AlertDescription>
        ) : null}
      </div>
    </Alert>
  );
}
