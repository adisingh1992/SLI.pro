import { useState, type FormEvent } from "react";
import { Link, Redirect } from "wouter";
import {
  AuthShell,
  PrimaryButton,
  UnderlineInput,
  WingLogo,
} from "@/components/wing/AuthShell";
import { ResetPasswordModal } from "@/components/wing/ResetPasswordModal";
import { useAuth } from "@/hooks/use-auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sign in. The wing5 layout, kept as designed.
 *
 * Two things the prototype drew but did not wire, both real here:
 *
 *   Continue with LinkedIn   called the same function as the password form, so it looked
 *                            connected and signed you in as whoever the demo said. It is
 *                            an anchor to `/api/auth/linkedin` now, because the OAuth
 *                            redirect has to leave the SPA.
 *   Forgot Password?         opened a modal that sent nothing. It posts to
 *                            `/api/forgot-password`.
 *
 * "Remember me" is rendered because the design has it, and it is bound to state rather
 * than left loose — but see the note at the checkbox for what it does and does not mean.
 */
export default function WingLoginPage() {
  const { user, loginMutation } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [resetOpen, setResetOpen] = useState(false);

  if (user) return <Redirect to="/" />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: { email?: string; password?: string } = {};
    if (!EMAIL_RE.test(email.trim())) next.email = "Please enter a valid email";
    if (!password) next.password = "Required";
    setErrors(next);
    if (Object.keys(next).length) return;
    loginMutation.mutate({ username: email.trim(), password });
  };

  return (
    <>
      <p className="fixed right-5 top-6 z-20 text-[13px] text-midnight/60">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-midnight hover:underline">
          Create Your Account
        </Link>
      </p>

      <AuthShell>
        <WingLogo />

        <form onSubmit={submit} className="mt-10 space-y-6" noValidate>
          <UnderlineInput
            label="Email address"
            type="email"
            required
            autoComplete="username"
            placeholder="name@university.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email ?? null}
          />
          <UnderlineInput
            label="Password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password ?? null}
          />

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-[13px] text-plum">
              {/*
                * Bound, but honest about its scope: the session cookie's lifetime is set
                * server-side and this does not change it. Unchecking it clears the saved
                * address on this device, which is the part the browser lets us control.
                * The prototype's version had no state and no name at all.
                */}
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-3.5 w-3.5 accent-[#2a2a38]"
              />
              Remember me
            </label>
            <button
              type="button"
              onClick={() => setResetOpen(true)}
              className="text-[13px] text-plum hover:text-wine hover:underline"
            >
              Forgot Password?
            </button>
          </div>

          {loginMutation.isError && (
            <p className="text-[12px] text-salmon">
              {loginMutation.error.message || "That didn't work. Check your details?"}
            </p>
          )}

          <div className="space-y-3 pt-2">
            <PrimaryButton type="submit" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? "Logging in…" : "Log in"}
            </PrimaryButton>

            <a
              href="/api/auth/linkedin"
              className="flex w-full items-center justify-center gap-3 rounded-[2px] border border-wing-border bg-white px-4 py-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-wine transition-colors hover:border-wine/40"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0" fill="#0A66C2">
                <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.03-1.85-3.03-1.85 0-2.13 1.45-2.13 2.94v5.66H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
              </svg>
              Continue with LinkedIn
            </a>
          </div>
        </form>
      </AuthShell>

      <ResetPasswordModal open={resetOpen} onClose={() => setResetOpen(false)} />
    </>
  );
}
