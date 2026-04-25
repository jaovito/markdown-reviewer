import { TooltipProvider } from "@/shared/ui/tooltip";
import { AppErrorBoundary } from "./error-boundary";
import { Providers } from "./providers";
import { AppRouter } from "./routes";

export function App() {
  return (
    <AppErrorBoundary>
      <Providers>
        <TooltipProvider delayDuration={250}>
          <AppRouter />
        </TooltipProvider>
      </Providers>
    </AppErrorBoundary>
  );
}
