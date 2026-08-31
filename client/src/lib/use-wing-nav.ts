import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { startFoundationSession } from "@/lib/wing-api";
import type { WingModule } from "@/lib/wing-modules";

/**
 * Explore-overlay state and the one way to enter a module.
 *
 * Every screen carries the shell, and the shell can open Explore, so every screen needs
 * this. It exists as a hook rather than as copies because entering a module is not one
 * line: a Foundation module has to be started before its stream will accept a turn, and
 * a screen module navigates instead. Six copies of that would be six chances for one of
 * them to skip the start call — which fails as a message that silently does nothing.
 */
export function useWingNav() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [exploreOpen, setExploreOpen] = useState(false);

  const pickModule = useCallback(
    async (m: WingModule) => {
      if (m.href) {
        navigate(m.href);
        return;
      }
      if (m.sessionType) {
        await startFoundationSession(Number(m.sessionType.replace("foundation_", "")));
        void queryClient.invalidateQueries({ queryKey: ["wing", "threads"] });
      }
      navigate(`/chat/${m.slug}`);
    },
    [navigate, queryClient],
  );

  return { exploreOpen, setExploreOpen, pickModule };
}
