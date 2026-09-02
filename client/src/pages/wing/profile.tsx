import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AppShell, OfflineBanner } from "@/components/wing/AppShell";
import { ExploreOverlay } from "@/components/wing/ExploreOverlay";
import { useWingNav } from "@/lib/use-wing-nav";
import { useAuth } from "@/hooks/use-auth";
import { listThreads } from "@/lib/wing-api";
import type { BrandingIntake } from "@shared/schema";

/**
 * "Your profile" — read-only, as the design has it.
 *
 * Every value in the prototype was a hardcoded literal ("Sarah Miller", "Harvard Business
 * School"), so this is the first version that shows the student their own details. There
 * is deliberately no edit affordance: the design has none, and inventing one means
 * deciding what a student may change about a record their institution also reads.
 *
 * ── LAYOUT MATCHES wing5's `routes/profile.tsx` EXACTLY ──────────────────
 * This used to wrap the rows in a card — `rounded-2xl bg-white ring-1 ring-wing-border` —
 * with a subtitle under the heading and a "Something wrong here?" footer note, none of
 * which wing5 has. wing5's page is just an `<h1>` and a flat list of rows with a hairline
 * under each one, sitting directly on the page background; no box, no subtitle, no footer.
 * Brought the markup back in line with that — container width (720px), heading size/weight/
 * colour, row spacing and label styling all copied from wing5's own classes rather than
 * approximated.
 */
export default function WingProfilePage() {
  const { user } = useAuth();
  const { exploreOpen, setExploreOpen, pickModule } = useWingNav();

  const { data: brandingIntake } = useQuery<BrandingIntake | null>({
    queryKey: ["/api/branding-intake"],
  });
  const accountOnly = brandingIntake?.completed !== true;
  const { data: threads = [] } = useQuery({
    queryKey: ["wing", "threads"],
    queryFn: listThreads,
    enabled: !accountOnly,
  });
  const { data: profile, isLoading } = useQuery<Record<string, unknown>>({
    queryKey: ["/api/user/profile"],
  });

  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "—";

  return (
    <AppShell
      threads={threads}
      activeThreadId={null}
      onOpenExplore={() => setExploreOpen(true)}
      accountOnly={accountOnly}
    >
      <OfflineBanner />
      {!accountOnly && exploreOpen && (
        <ExploreOverlay onClose={() => setExploreOpen(false)} onPick={pickModule} />
      )}

      <div className="min-h-screen px-6 py-10">
        <div className="mx-auto max-w-[720px]">
          <h1 className="text-[30px] font-semibold text-wine">Your profile</h1>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-plum/50" />
            </div>
          ) : (
            <section className="mt-8">
              <Row label="Name" value={name} />
              <Row label="Email" value={user?.username ?? "—"} />
              <Row label="Phone number" value={str(profile?.phoneNumber) ?? "Not provided"} />
              <Row label="Institution" value={str(profile?.institutionName) ?? "—"} />
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-wing-border py-3">
      <span className="font-sans text-xs uppercase tracking-[0.12em] text-plum">{label}</span>
      <span className="text-[15px] text-forest">{value}</span>
    </div>
  );
}
