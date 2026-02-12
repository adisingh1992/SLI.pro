import { Lock, ArrowRight } from "lucide-react";

interface ToolCardProps {
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
  disabled?: boolean;
  disabledMessage?: string;
  statusLabel?: string;
  statusType?: "available" | "completed" | "info";
}

const statusStyles: Record<string, string> = {
  available: "text-[var(--dashboard-aqua)]",
  completed: "text-emerald-500",
  info: "text-amber-500",
};

export default function ToolCard({
  title,
  description,
  buttonLabel,
  onClick,
  disabled = false,
  disabledMessage,
  statusLabel,
  statusType = "available",
}: ToolCardProps) {
  return (
    <div
      className={`bg-white p-8 shadow-[0_20px_50px_rgba(0,0,0,0.03)] border border-[var(--dashboard-border)] flex flex-col transition-all duration-300 ${
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "hover:shadow-[0_20px_50px_rgba(0,0,0,0.08)] hover:-translate-y-0.5"
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="dashboard-heading text-lg font-normal text-[var(--dashboard-void)]">
          {title}
        </h3>
        {disabled ? (
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[1px] font-semibold text-gray-400">
            <Lock className="w-3.5 h-3.5" />
            Locked
          </div>
        ) : statusLabel ? (
          <span className={`text-[10px] uppercase tracking-[1px] font-semibold ${statusStyles[statusType]}`}>
            {statusLabel}
          </span>
        ) : null}
      </div>

      <p className="text-sm leading-relaxed text-gray-500 flex-1 mb-6">
        {disabled && disabledMessage ? disabledMessage : description}
      </p>

      <button
        onClick={() => !disabled && onClick()}
        disabled={disabled}
        className={`self-start text-[11px] uppercase tracking-[2px] font-semibold flex items-center gap-2 transition-colors ${
          disabled
            ? "text-gray-300 cursor-not-allowed"
            : "text-[var(--dashboard-aqua-dark)] hover:text-[var(--dashboard-void)]"
        }`}
      >
        {buttonLabel}
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
