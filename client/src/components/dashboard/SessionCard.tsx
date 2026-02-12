import { Lock, Play, MessageSquare, CheckCircle } from "lucide-react";

type SessionStatus = "locked" | "available" | "in_progress" | "completed";

interface SessionCardProps {
  header: string;
  title: string;
  description: string;
  status: SessionStatus;
  onClick?: () => void;
}

const statusConfig: Record<SessionStatus, {
  icon: typeof Lock;
  label: string;
  labelClass: string;
}> = {
  locked: {
    icon: Lock,
    label: "Locked",
    labelClass: "text-gray-400",
  },
  available: {
    icon: Play,
    label: "Available",
    labelClass: "text-[var(--dashboard-aqua)]",
  },
  in_progress: {
    icon: MessageSquare,
    label: "In Progress",
    labelClass: "text-amber-500",
  },
  completed: {
    icon: CheckCircle,
    label: "Completed",
    labelClass: "text-emerald-500",
  },
};

export default function SessionCard({
  header,
  title,
  description,
  status,
  onClick,
}: SessionCardProps) {
  const config = statusConfig[status];
  const Icon = config.icon;
  const isClickable = status !== "locked";

  return (
    <div
      onClick={() => isClickable && onClick?.()}
      className={`bg-white p-8 shadow-[0_20px_50px_rgba(0,0,0,0.03)] border border-[var(--dashboard-border)] flex flex-col transition-all duration-300 ${
        isClickable
          ? "cursor-pointer hover:shadow-[0_20px_50px_rgba(0,0,0,0.08)] hover:-translate-y-0.5"
          : "opacity-50 cursor-not-allowed"
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] uppercase tracking-[2px] text-[var(--dashboard-aqua)] font-semibold">
          {header}
        </span>
        <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[1px] font-semibold ${config.labelClass}`}>
          <Icon className="w-3.5 h-3.5" />
          {config.label}
        </div>
      </div>

      <h3 className="dashboard-heading text-xl font-normal mb-3 text-[var(--dashboard-void)]">
        {title}
      </h3>

      <p className="text-sm leading-relaxed text-gray-500 flex-1">
        {description}
      </p>
    </div>
  );
}
