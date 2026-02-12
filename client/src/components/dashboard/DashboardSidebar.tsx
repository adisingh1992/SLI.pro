import { useState, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import sliProLogo from "@/assets/sliPro-logos_aqua.png";

export interface NavItem {
  label: string;
  locked?: boolean;
  completed?: boolean;
  href?: string;
  onClick?: () => void;
}

export interface PhaseGroup {
  title: string;
  disabled?: boolean;
  items: NavItem[];
}

export interface NavSection {
  label: string;
  phaseGroups: PhaseGroup[];
}

interface DashboardSidebarProps {
  sections: NavSection[];
  activePhaseTitle?: string;
  onNavItemClick?: (item: NavItem) => void;
}

function PhaseGroupComponent({
  group,
  isActive,
  onItemClick,
}: {
  group: PhaseGroup;
  isActive: boolean;
  onItemClick?: (item: NavItem) => void;
}) {
  const [expanded, setExpanded] = useState(isActive);

  useEffect(() => {
    setExpanded(isActive);
  }, [isActive]);

  return (
    <div className="mb-6">
      <button
        onClick={() => !group.disabled && setExpanded(!expanded)}
        className={`flex w-full items-center justify-between text-[9px] uppercase tracking-[2px] font-semibold mb-3 ${
          group.disabled
            ? "text-[var(--dashboard-aqua)] opacity-50 cursor-default"
            : "text-[var(--dashboard-aqua)] cursor-pointer"
        }`}
      >
        <span>{group.title}</span>
        {!group.disabled && (
          <ChevronDown
            className={`w-3 h-3 transition-transform ${expanded ? "" : "-rotate-90"}`}
          />
        )}
      </button>

      {expanded && !group.disabled &&
        group.items.map((item, idx) => (
          <div
            key={idx}
            onClick={() => !item.locked && onItemClick?.(item)}
            className={`text-[15px] my-3 text-white nav-item-link flex items-center gap-2.5 ${
              item.locked
                ? "opacity-30 cursor-not-allowed"
                : item.completed
                  ? "opacity-100 cursor-pointer"
                  : "opacity-80 cursor-pointer"
            }`}
          >
            {item.completed && (
              <Check className="w-4 h-4 text-[var(--dashboard-aqua)] shrink-0" />
            )}
            <span>{item.label}</span>
            {item.locked && <span>🔒</span>}
          </div>
        ))}
    </div>
  );
}

export default function DashboardSidebar({
  sections,
  activePhaseTitle,
  onNavItemClick,
}: DashboardSidebarProps) {
  return (
    <aside className="w-80 bg-[var(--dashboard-void)] py-[50px] px-10 flex flex-col border-r border-white/5 shrink-0">
      <div className="mb-[50px] flex items-center gap-3">
        <img src={sliProLogo} alt="SLI.pro" className="h-8 object-contain" />
        <span className="text-xl font-bold tracking-[3px]" style={{ fontFamily: "Lora, serif" }}>
          <span className="text-white">SLI</span>
          <span className="text-[var(--dashboard-aqua)]">.pro</span>
        </span>
      </div>

      {sections.map((section, sIdx) => (
        <div key={sIdx} className="mb-10">
          <div className="nav-label flex items-center gap-3 text-[10px] uppercase tracking-[3px] text-white font-semibold mb-7">
            {section.label}
          </div>

          {section.phaseGroups.map((group, gIdx) => (
            <PhaseGroupComponent
              key={gIdx}
              group={group}
              isActive={group.title === activePhaseTitle}
              onItemClick={onNavItemClick}
            />
          ))}
        </div>
      ))}
    </aside>
  );
}
