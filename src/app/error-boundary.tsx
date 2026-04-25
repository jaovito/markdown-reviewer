import { i18next } from "@/shared/i18n";
import { describeError, isAppError } from "@/shared/ipc/errors";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[app] uncaught error", error, info);
  }

  reset = () => this.setState({ error: null });

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const t = i18next.t.bind(i18next);

    const view = isAppError(error)
      ? describeError(error)
      : { title: t("app.states.somethingWrong"), description: error.message };

    return (
      <main className="mx-auto flex min-h-full w-full max-w-xl flex-col gap-4 p-8">
        <Alert tone="destructive">
          <AlertTitle>{view.title}</AlertTitle>
          <AlertDescription>{view.description}</AlertDescription>
          {"actionHint" in view && view.actionHint ? (
            <AlertDescription className="mt-1 text-xs">{view.actionHint}</AlertDescription>
          ) : null}
        </Alert>
        <Button onClick={this.reset} className="self-start">
          {t("app.actions.tryAgain")}
        </Button>
      </main>
    );
  }
}
