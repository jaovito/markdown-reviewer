import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  AlertTriangleIcon,
  ArrowUpCircleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  RefreshCwIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import type { useAutoUpdater } from "../hooks/useAutoUpdater";

interface UpdateModalProps {
  updater: ReturnType<typeof useAutoUpdater>;
  isOpen: boolean;
  onClose: () => void;
}

export function UpdateModal({ updater, isOpen, onClose }: UpdateModalProps) {
  if (!isOpen && updater.status === "idle") return null;

  const {
    status,
    updateInfo,
    progressPercent,
    errorMessage,
    downloadAndInstallUpdate,
    relaunchApp,
    checkForUpdates,
  } = updater;

  const handleClose = () => {
    updater.dismiss();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-2xl transition-all">
        {/* Header close button */}
        <button
          type="button"
          onClick={handleClose}
          disabled={status === "downloading"}
          className="absolute right-4 top-4 rounded-md p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] disabled:opacity-50 transition-colors"
          aria-label="Fechar"
        >
          <XIcon className="size-4" />
        </button>

        {/* Status: Checking */}
        {status === "checking" && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <RefreshCwIcon className="size-10 animate-spin text-[hsl(var(--primary))] mb-4" />
            <h3 className="text-lg font-semibold tracking-tight">Buscando Atualizações</h3>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              Verificando se há novas versões disponíveis...
            </p>
          </div>
        )}

        {/* Status: Available */}
        {status === "available" && updateInfo && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
                <ArrowUpCircleIcon className="size-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold tracking-tight">Nova Versão Disponível</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge tone="muted" className="text-xs font-mono">
                    v{updateInfo.currentVersion}
                  </Badge>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">→</span>
                  <Badge tone="default" className="text-xs font-mono">
                    v{updateInfo.version}
                  </Badge>
                </div>
              </div>
            </div>

            <p className="text-sm text-[hsl(var(--foreground))]">
              Uma nova versão do software está disponível. Deseja baixar e instalar a atualização
              agora?
            </p>

            {updateInfo.body && (
              <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-3 max-h-48 overflow-y-auto">
                <div className="flex items-center gap-1.5 text-xs font-medium text-[hsl(var(--foreground))] mb-1.5">
                  <SparklesIcon className="size-3.5 text-[hsl(var(--primary))]" />
                  <span>Notas da Versão</span>
                </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))] whitespace-pre-wrap leading-relaxed">
                  {updateInfo.body}
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 mt-2">
              <Button variant="outline" size="sm" onClick={handleClose}>
                Lembrar Mais Tarde
              </Button>
              <Button size="sm" onClick={downloadAndInstallUpdate} className="gap-1.5">
                <DownloadIcon className="size-4" />
                Baixar e Atualizar
              </Button>
            </div>
          </div>
        )}

        {/* Status: Downloading */}
        {status === "downloading" && (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
                <DownloadIcon className="size-6 animate-bounce" />
              </div>
              <div>
                <h3 className="text-lg font-semibold tracking-tight">Baixando Atualização</h3>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Aguarde enquanto os arquivos são transferidos...
                </p>
              </div>
            </div>

            <div className="space-y-2 mt-2">
              <div className="flex justify-between text-xs font-medium">
                <span>Progresso</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                <div
                  className="h-full bg-[hsl(var(--primary))] transition-all duration-300 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Status: Ready */}
        {status === "ready" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <CheckCircle2Icon className="size-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold tracking-tight">Atualização Pronta!</h3>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  O download foi concluído. Reinicie o aplicativo para aplicar a nova versão.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 mt-2">
              <Button size="sm" onClick={relaunchApp} className="gap-1.5 w-full sm:w-auto">
                <RefreshCwIcon className="size-4" />
                Reiniciar para Atualizar
              </Button>
            </div>
          </div>
        )}

        {/* Status: Up-To-Date */}
        {status === "up-to-date" && (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 mb-3">
              <CheckCircle2Icon className="size-7" />
            </div>
            <h3 className="text-lg font-semibold tracking-tight">Você está Atualizado!</h3>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1 mb-4">
              Seu aplicativo já está rodando a versão mais recente disponível.
            </p>
            <Button variant="outline" size="sm" onClick={handleClose}>
              Entendido
            </Button>
          </div>
        )}

        {/* Status: Error */}
        {status === "error" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <AlertTriangleIcon className="size-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold tracking-tight">Falha na Atualização</h3>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Ocorreu um erro ao tentar verificar ou instalar atualizações.
                </p>
              </div>
            </div>

            {errorMessage && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs font-mono text-destructive break-words">
                {errorMessage}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 mt-2">
              <Button variant="outline" size="sm" onClick={handleClose}>
                Fechar
              </Button>
              <Button size="sm" onClick={checkForUpdates} className="gap-1.5">
                <RefreshCwIcon className="size-4" />
                Tentar Novamente
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
