import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, Clock, Send, XCircle } from "lucide-react";

type Status = "PENDENTE" | "VALIDO" | "ERRO" | "ENVIADO" | "PROCESSADO";

const styles = {
  PENDENTE: "bg-slate-100 text-slate-700 border-slate-200",
  VALIDO: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ERRO: "bg-red-50 text-red-700 border-red-200",
  ENVIADO: "bg-blue-50 text-blue-700 border-blue-200",
  PROCESSADO: "bg-purple-50 text-purple-700 border-purple-200",
};

const icons = {
  PENDENTE: Clock,
  VALIDO: CheckCircle2,
  ERRO: XCircle,
  ENVIADO: Send,
  PROCESSADO: CheckCircle2,
};

const labels: Record<Status, string> = {
  PENDENTE: "Pendente",
  VALIDO: "Válido",
  ERRO: "Erro",
  ENVIADO: "Enviado",
  PROCESSADO: "Processado",
};

export function StatusBadge({ status, className }: { status: string | null; className?: string }) {
  const normalizedStatus = (status || "PENDENTE") as Status;
  const Icon = icons[normalizedStatus] || AlertCircle;
  const style = styles[normalizedStatus] || styles.PENDENTE;
  const label = labels[normalizedStatus] || normalizedStatus;

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border shadow-sm",
      style,
      className
    )} data-testid={`badge-status-${normalizedStatus.toLowerCase()}`}>
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}
