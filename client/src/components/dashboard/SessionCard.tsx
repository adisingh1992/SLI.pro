import { Play, MessageSquare, CircleDashed } from "lucide-react";

/*
 * Mirrors the session_status enum, INCLUDING ended_early.
 *
 * It was missing, and the omission was a crash rather than a cosmetic gap:
 * `statusConfig[status]` returned undefined for a session someone had exited
 * early, and the next line reads `config.icon`. Foundation Sessions have had an
 * early-exit route all along, so any student who used it would have taken the
 * whole dashboard down on their next visit.
 */
type SessionStatus =
  | "locked" | "available" | "in_progress" | "completed" | "ended_early";

interface SessionCardProps {
  header: string;
  title: string;
  description: string;
  status: SessionStatus;
  /** A2 micro-copy: roughly how long this takes. */
  duration?: string;
  /** A2 micro-copy: what the student walks away knowing. */
  reveals?: string;
  onClick?: () => void;
}

const statusConfig: Record<SessionStatus, {
  icon: typeof Play;
  label: string;
  labelClass: string;
}> = {
  /*
   * IG-UX01, which is settled: "Every module enterable at any time; depth adapts, access
   * does not." Feature List A2 is dead. A padlock and the word "Locked" are the state her
   * success criterion says a user never encounters, so the card presents it as available.
   *
   * The status still exists in the database and the admin surfaces still report it. This
   * is the student-facing card declining to render it as a gate.
   */
  locked: {
    icon: Play,
    label: "Available",
    labelClass: "text-[var(--dashboard-aqua)]",
  },
  available: {
    icon: Play,
    label: "Available",
    labelClass: "text-[var(--dashboard-aqua)]",
  },
  in_progress: {
    icon: MessageSquare,
    label: "In progress",
    labelClass: "text-amber-500",
  },
  /*
   * IG-UX03. Was a tick and the word "Completed" — the exact pairing her card names:
   * "progress bars and checkmarks turn the experience into a to-do list. Milestone
   * language turns it into a portfolio." "Built" is her own replacement, and the icon goes
   * with it, because the tick was doing the same work as the word.
   *
   * The comment below on `ended_early` was already reasoning this way about "Paused". This
   * is the same argument applied one entry up.
   */
  completed: {
    icon: MessageSquare,
    label: "Built",
    labelClass: "text-emerald-500",
  },
  // "Paused", not "Abandoned" or "Incomplete". Stopping early is a legitimate
  // choice the platform explicitly offers, and the work done is kept — naming
  // it as a failure would contradict both.
  ended_early: {
    icon: CircleDashed,
    label: "Paused",
    labelClass: "text-slate-400",
  },
};

export default function SessionCard({
  header,
  title,
  description,
  status,
  duration,
  reveals,
  onClick,
}: SessionCardProps) {
  // Falls back rather than throwing. A status this component has not been
  // taught about should degrade to a usable card, not blank the dashboard.
  const config = statusConfig[status] ?? statusConfig.available;
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

      {/*
        A2 micro-copy — what it reveals, and how long it takes.

        Hidden once the session is finished: "you'll come away knowing which
        function you're credible in" is an invitation beforehand and a
        statement of the obvious afterwards. The duration goes too, since by
        then they know.
      */}
      {(reveals || duration) && status !== "completed" && (
        <div className="mt-4 border-t border-[var(--dashboard-border)] pt-3">
          {reveals && (
            <p className="text-sm leading-relaxed text-[var(--dashboard-void)]">
              <span className="text-gray-400">You'll come away with — </span>
              {reveals}
            </p>
          )}
          {duration && (
            <p className="mt-1.5 text-[11px] uppercase tracking-[1px] text-gray-400">
              {duration}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
