import { useState } from "react";
import { ChevronDown } from "lucide-react";
import sliProLogo from "@/assets/sliPro-logos_aqua.png";

interface NavItem {
  label: string;
  locked?: boolean;
  href?: string;
  onClick?: () => void;
}

interface PhaseGroup {
  title: string;
  disabled?: boolean;
  items: NavItem[];
}

interface NavSection {
  label: string;
  phaseGroups: PhaseGroup[];
}

interface DashboardSidebarProps {
  sections: NavSection[];
  onNavItemClick?: (item: NavItem) => void;
}

function PhaseGroupComponent({
  group,
  onItemClick,
}: {
  group: PhaseGroup;
  onItemClick?: (item: NavItem) => void;
}) {
  const [expanded, setExpanded] = useState(!group.disabled);

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

      {expanded &&
        group.items.map((item, idx) => (
          <div
            key={idx}
            onClick={() => !item.locked && onItemClick?.(item)}
            className={`text-[15px] my-3 text-white nav-item-link ${
              item.locked
                ? "opacity-30 cursor-not-allowed flex items-center gap-2.5"
                : "opacity-80 cursor-pointer"
            }`}
          >
            {item.label}
            {item.locked && <span>🔒</span>}
          </div>
        ))}
    </div>
  );
}

export default function DashboardSidebar({
  sections,
  onNavItemClick,
}: DashboardSidebarProps) {
  return (
    <aside className="w-80 bg-[var(--dashboard-void)] py-[50px] px-10 flex flex-col border-r border-white/5 shrink-0">
      <div className="mb-[50px]">
        <img src={sliProLogo} alt="SLI.pro" className="h-8 object-contain" />
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
              onItemClick={onNavItemClick}
            />
          ))}
        </div>
      ))}
    </aside>
  );
}
