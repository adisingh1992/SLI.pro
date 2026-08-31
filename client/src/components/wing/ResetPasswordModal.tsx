import { ArrowLeft, Mail, X } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/queryClient";

/**
 * "Forgot password?" — the design's modal, wired to `/api/forgot-password`.
 *
 * ── IT ALWAYS SAYS THE SAME THING ────────────────────────────────────────
 * Success and "no such account" both land on "Check your inbox". That is deliberate and
 * it is the one place on this screen where being less helpful is correct: a reset form
 * that says "no account with that email" is an account-existence oracle, and anyone can
 * walk a list of addresses through it to learn which of a cohort's students are enrolled.
 *
 * A transport failure is different — the mail genuinely did not go — and that does report.
 */
export function ResetPasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSent(false);
    setEmail("");
    setError(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async () => {
    if (!email.trim()) return setError("Enter the email you signed up with.");
    setBusy(true);
    setError(null);
    const res = await apiFetch("POST", "/api/forgot-password", { username: email.trim() });
    setBusy(false);
    /* 404 is "no such account" and must not be distinguishable. See the header. */
    if (res.ok || res.status === 404) setSent(true);
    else setError("That didn't send. Try again in a moment?");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-wine/80 px-5"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Reset your password"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] animate-rise rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 text-[13px] text-plum transition-colors hover:text-wine"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Login
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-sand transition-colors hover:text-plum"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {sent ? (
          <div className="mt-6">
            <h2 className="text-[20px] font-medium text-wine">Check your inbox</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-plum">
              If there&rsquo;s an account for that address, a reset link is on its way. It
              expires in an hour.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-[2px] bg-wine px-4 py-3.5 text-[12px] font-semibold uppercase tracking-[0.22em] text-white"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="mt-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-aqua-light">
              <Mail className="h-4 w-4 text-wine" />
            </span>
            <h2 className="mt-4 text-[20px] font-medium text-wine">Reset your password</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-plum">
              Tell us the address you signed up with and we&rsquo;ll send you a link.
            </p>

            <label className="mt-5 block">
              <span className="block text-[12px] font-semibold text-midnight">Email address</span>
              <input
                type="email"
                value={email}
                autoComplete="username"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="name@university.edu"
                className="mt-2 w-full border-0 border-b border-wing-border bg-transparent pb-2 text-[13px] text-midnight placeholder:text-sand focus:border-wine focus:outline-none"
              />
            </label>

            {error && <p className="mt-3 text-[12px] text-salmon">{error}</p>}

            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="mt-6 w-full rounded-[2px] bg-wine px-4 py-3.5 text-[12px] font-semibold uppercase tracking-[0.22em] text-white disabled:bg-wine/45"
            >
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
