import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, OfflineBanner } from "@/components/wing/AppShell";
import { ExploreOverlay } from "@/components/wing/ExploreOverlay";
import { Switch } from "@/components/ui/switch";
import { useWingNav } from "@/lib/use-wing-nav";
import { apiFetch } from "@/lib/queryClient";
import {
  getNotificationPreferences,
  listThreads,
  updateNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/wing-api";

/**
 * Settings — notifications and account security.
 *
 * ── THE TOGGLES USED TO BE TEXT, NOT SWITCHES ─────────────────────────────
 * wing5's own Email/SMS controls are two uncontrolled `Switch`es with no `onChange` —
 * clicking one flips it in the browser and nothing else happens. This screen used to say
 * so explicitly and render plain text instead of a switch: `user_channel_preferences`
 * (`email_opt_in` default true, `sms_opt_in` default false — every user gets a row at
 * registration) existed in the schema and nothing read or wrote it, and a switch that
 * looks wired and isn't is worse than no switch at all.
 *
 * The column was always real; only the route was missing. `notification-preferences-routes.ts`
 * added GET/PATCH for it, so these are real toggles now — not a restyle of a fake one.
 *
 * ── LAYOUT MATCHES wing5's `routes/settings.tsx` ──────────────────────────
 * Flat rows with a hairline under each (no card wrapper) for Email/SMS/Change password,
 * a bordered card for the password-change panel, and a labelled "Account & Data" card for
 * deletion — all copied from wing5's own classes. Kept `support@mywing.ai` rather than
 * wing5's `support@sli.pro` for this card: this app already uses `support@mywing.ai`
 * everywhere else (files, the deletion note that used to live here), and wing5 itself
 * isn't consistent between its own pages on this address, so there's no single wing5
 * answer to defer to — matching this app's own existing convention beats copying
 * whichever of wing5's two addresses happened to be on this particular screen.
 */
export default function WingSettingsPage() {
  const { exploreOpen, setExploreOpen, pickModule } = useWingNav();
  const { data: threads = [] } = useQuery({ queryKey: ["wing", "threads"], queryFn: listThreads });
  const queryClient = useQueryClient();

  const { data: prefs } = useQuery({
    queryKey: ["wing", "notification-preferences"],
    queryFn: getNotificationPreferences,
  });
  const email = prefs?.emailOptIn ?? true;
  const sms = prefs?.smsOptIn ?? false;

  const updatePrefs = useMutation({
    mutationFn: (patch: Partial<NotificationPreferences>) => updateNotificationPreferences(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ["wing", "notification-preferences"] });
      const previous = queryClient.getQueryData<NotificationPreferences>([
        "wing",
        "notification-preferences",
      ]);
      queryClient.setQueryData<NotificationPreferences>(["wing", "notification-preferences"], (old) => ({
        emailOptIn: old?.emailOptIn ?? true,
        smsOptIn: old?.smsOptIn ?? false,
        ...patch,
      }));
      return { previous };
    },
    onError: (_err, _patch, context) => {
      /*
       * Always restore exactly what onMutate captured — including `undefined`.
       *
       * `if (context?.previous)` used to guard this, which silently did nothing
       * whenever the toggle's first-ever load had no cached data yet (a fresh
       * page, or a GET that itself failed): `previous` was `undefined`, the
       * falsy check skipped the revert, and a failed PATCH left the optimistic
       * flip sitting in the cache with nothing to correct it — it read as
       * "saved" until the next hard reload re-fetched the real value and the
       * toggle silently snapped back. Unconditionally writing `context.previous`
       * back (even when that's `undefined`, clearing the query back to no data)
       * is what actually undoes the optimistic update on failure.
       */
      queryClient.setQueryData(["wing", "notification-preferences"], context?.previous);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["wing", "notification-preferences"] }),
  });

  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const change = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("POST", "/api/reset-password", {
        currentPassword: current,
        newPassword: next,
      });
      if (!res.ok) {
        throw new Error(
          (res.data as { message?: string })?.message ?? "That didn't go through.",
        );
      }
      return res.data;
    },
    onSuccess: () => {
      setDone(true);
      setOpen(false);
      setCurrent("");
      setNext("");
      setConfirm("");
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = () => {
    if (!current) return setError("Enter your current password.");
    if (next.length < 8) return setError("Use at least 8 characters.");
    if (next !== confirm) return setError("Those two don't match.");
    setError(null);
    change.mutate();
  };

  return (
    <AppShell threads={threads} activeThreadId={null} onOpenExplore={() => setExploreOpen(true)}>
      <OfflineBanner />
      {exploreOpen && <ExploreOverlay onClose={() => setExploreOpen(false)} onPick={pickModule} />}

      <div className="min-h-screen px-6 py-10">
        <div className="mx-auto max-w-[720px]">
          <h1 className="text-[30px] font-semibold text-wine">Settings</h1>

          <section className="mt-8 space-y-1">
            <div className="flex items-center justify-between border-b border-wing-border py-4">
              <span className="font-sans text-sm text-forest">Email</span>
              <Switch
                checked={email}
                onCheckedChange={(checked) => updatePrefs.mutate({ emailOptIn: checked })}
                aria-label="Email notifications"
                className="quiet-focus data-[state=checked]:bg-salmon"
              />
            </div>

            <div className="flex items-center justify-between border-b border-wing-border py-4">
              <span className="font-sans text-sm text-forest">SMS</span>
              <Switch
                checked={sms}
                onCheckedChange={(checked) => updatePrefs.mutate({ smsOptIn: checked })}
                aria-label="SMS notifications"
                className="quiet-focus data-[state=checked]:bg-salmon"
              />
            </div>

            <div className="flex items-center justify-between border-b border-wing-border py-4">
              <span className="font-sans text-sm text-forest">Change password</span>
              <button
                type="button"
                onClick={() => {
                  setOpen((o) => !o);
                  setDone(false);
                  setError(null);
                }}
                className="rounded-full border border-midnight/30 px-5 py-2 font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-midnight hover:bg-midnight/5"
              >
                {open ? "Cancel" : "Change"}
              </button>
            </div>
          </section>

          {open && (
            <div className="mt-5 animate-rise rounded-xl bg-white p-6 ring-1 ring-wing-border">
              <p className="label-eyebrow">Change password</p>
              <div className="mt-4 space-y-3">
                <PasswordField label="Current password" value={current} onChange={setCurrent} />
                <PasswordField label="New password" value={next} onChange={setNext} />
                <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} />
              </div>
              {error && <p className="mt-3 text-xs text-salmon">{error}</p>}
              <button
                type="button"
                disabled={change.isPending}
                onClick={submit}
                className="mt-5 rounded-full bg-salmon px-7 py-3 font-sans text-xs font-semibold uppercase tracking-[0.16em] text-white hover:opacity-90 disabled:opacity-50"
              >
                {change.isPending ? "Updating…" : "Update password"}
              </button>
            </div>
          )}

          {done && <p className="mt-4 font-sans text-[13px] text-plum">Password updated.</p>}

          <section className="mt-10">
            <h2 className="font-sans text-xs uppercase tracking-[0.12em] text-plum">
              Account &amp; Data
            </h2>
            <div className="mt-3 rounded-xl bg-white p-5 ring-1 ring-wing-border">
              <h3 className="text-[15px] font-semibold text-forest">Delete your account and data</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-plum">
                To permanently delete your account and all associated data, email{" "}
                <a
                  href="mailto:support@mywing.ai?subject=Account%20deletion%20request"
                  className="text-midnight underline underline-offset-2 transition-colors hover:text-salmon"
                >
                  support@mywing.ai
                </a>
                . We&rsquo;ll process your request and confirm once it&rsquo;s complete.
              </p>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function PasswordField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="font-sans text-[11px] uppercase tracking-[0.12em] text-plum">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={label.startsWith("Current") ? "current-password" : "new-password"}
        className="quiet-focus mt-2 w-full rounded-xl bg-wing-canvas px-4 py-3 text-[14px] text-forest outline-none ring-1 ring-wing-border placeholder:text-plum/70 focus:ring-1 focus:ring-aqua"
      />
    </label>
  );
}
