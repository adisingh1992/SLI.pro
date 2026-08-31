import { useState } from "react";
import { X } from "lucide-react";
import { EXPLORE_GROUPS, type WingModule } from "@/lib/wing-modules";

/**
 * "What do you want to work on?" — the module library.
 *
 * Grouped by purpose, in Danielle's §1.2 order and with her names. Both the groups and
 * the items come from the registry, so this and the composer's picker cannot disagree
 * about what exists — which the prototype's two hand-maintained lists already did.
 *
 * No locked modules and no padlocks (IG-UX01). Every item is clickable; a module with no
 * methodology behind it says so in the thread it opens.
 */
export function ExploreOverlay({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (m: WingModule) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 animate-rise overflow-y-auto bg-wing-canvas">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full text-plum hover:bg-black/5"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-[28px] text-forest">What do you want to work on?</h1>

        <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2">
          {EXPLORE_GROUPS.map((g) => (
            <section key={g.group}>
              <h2 className="label-eyebrow">{g.group}</h2>
              <ul className="mt-2 space-y-0.5">
                {g.items.map((item) => (
                  <li key={item.slug}>
                    <button
                      type="button"
                      onMouseEnter={() => setHovered(item.slug)}
                      onMouseLeave={() => setHovered(null)}
                      onFocus={() => setHovered(item.slug)}
                      onBlur={() => setHovered(null)}
                      onClick={() => {
                        onClose();
                        onPick(item);
                      }}
                      className="w-full rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-aqua-light/60"
                    >
                      <span className="text-base text-forest">{item.name}</span>
                      {hovered === item.slug && (
                        <span className="ml-3 text-xs text-plum">{item.desc}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
