import { SelectRepoRoute } from "@/features/onboarding";
import { Providers } from "./providers";

export function App() {
  return (
    <Providers>
      <SelectRepoRoute />
    </Providers>
  );
}
