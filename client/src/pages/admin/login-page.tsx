import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAdminZoom } from "@/hooks/use-admin-zoom";
import { useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  BookOpen,
  EyeIcon,
  EyeOffIcon,
  LoaderCircle,
  Lock,
  Mail,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Admin sign-in.
 *
 * ── WHY THIS IS NOT JUST A CARD ──────────────────────────────────────────
 * This is the first screen a partner sees in a demo, and the last thing
 * anyone looks at before deciding whether the product feels finished. The old
 * version was a centred card next to a mint-to-cream gradient panel carrying
 * three generic bullets — "Complete user management", "Track system
 * performance" — copy that could belong to any admin tool ever built, which is
 * the same as saying nothing.
 *
 * The left panel now says what this particular product does and who is behind
 * it. It is the only place in the panel with room for that, and it costs
 * nothing: the space exists on a desktop whether it is used or not.
 *
 * ── WHAT THE FORM DOES NOT DO ────────────────────────────────────────────
 * No "remember me" — sessions are server-side with a 24-hour cookie and a
 * checkbox implying otherwise would be a lie. No sign-up link — admin accounts
 * are provisioned, not requested. No social login — LinkedIn OAuth is for
 * students, and offering it here would let someone authenticate successfully
 * and still be refused, which is a worse experience than not offering it.
 *
 * ── THE NOT-AN-ADMIN CASE IS A REAL CASE ─────────────────────────────────
 * A student can hold valid credentials and legitimately reach this form. They
 * are not "denied" — they are in the wrong place, and the screen says so and
 * points them at their own dashboard rather than leaving them staring at an
 * error on a form they cannot pass.
 */

const formSchema = z.object({
  username: z.string().email({ message: "Please enter a valid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});

type FormValues = z.infer<typeof formSchema>;

const HIGHLIGHTS = [
  {
    icon: Users,
    title: "The cohort, and every student in it",
    body: "Progress through the three Foundation sessions, full session transcripts, positioning and advisor notes — on one screen per person.",
  },
  {
    icon: Mail,
    title: "Everything Wing sends",
    body: "Message copy, the academic calendar that triggers it, and a delivery log that shows what actually arrived.",
  },
  {
    icon: BookOpen,
    title: "The coaching methodology itself",
    body: "Heuristic cards, session objectives and completion criteria — editable without a deploy, for platform staff.",
  },
  {
    icon: BarChart3,
    title: "Numbers you can defend",
    body: "Engagement and completion by institution, with the denominators attached and exports for board reporting.",
  },
];

export default function AdminLoginPage() {
  const { user, isLoading: authLoading, loginMutation } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [notAnAdmin, setNotAnAdmin] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Sign-in is part of the admin panel, so it sits at the same zoom. Stepping
  // from 95% to 90% on submit would be a visible lurch.
  useAdminZoom();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { username: "", password: "" },
  });

  useEffect(() => {
    if (!authLoading && user?.isAdmin) navigate("/admin/dashboard");
  }, [user, authLoading, navigate]);

  const onSubmit = async (values: FormValues) => {
    setNotAnAdmin(false);
    try {
      const signedIn = await loginMutation.mutateAsync(values);

      if (signedIn?.isAdmin) {
        navigate("/admin/dashboard");
        return;
      }

      // Authenticated, but not staff. See the note at the top of this file.
      setNotAnAdmin(true);
    } catch {
      // Deliberately does not distinguish "no such account" from "wrong
      // password" — that difference tells an attacker which addresses are
      // registered.
      form.setError("password", {
        type: "manual",
        message: "That email and password don't match an account.",
      });
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[calc(100svh_/_var(--zoom,1))] items-center justify-center">
        <LoaderCircle className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (user?.isAdmin) return null;

  return (
    <div className="grid min-h-[calc(100svh_/_var(--zoom,1))] lg:grid-cols-[1.1fr_1fr]">
      {/* ── Context ──────────────────────────────────────────────────────
          Hidden below lg. On a phone, a screen with one job should have one
          job — scrolling past four feature blurbs to reach a password field
          is worse than not seeing them. */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand p-12 text-white lg:flex">
        {/* Flat shapes rather than a gradient: gradients band badly on the
            large flat areas a full-height panel is made of. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/[0.06]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-black/[0.07]"
        />

        <div className="relative flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
            <span className="text-sm font-semibold">W</span>
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">SLI Pro</p>
            <p className="text-xs text-white/70">Wing admin</p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            The machinery behind the coaching.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-white/80">
            Wing runs the conversations. This is where you see what came of them, decide what
            it says next, and check that it arrived.
          </p>

          <ul className="mt-9 space-y-5">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="flex gap-3.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <h.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">{h.title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-white/70">{h.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">
          Berkeley · Vanderbilt · SLI.pro
        </p>
      </div>

      {/* ── Form ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-center bg-background px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          {/* The brand mark repeats here because the left panel is hidden on
              phones and a sign-in form with no identity on it is where
              phishing lives. */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white">
              <span className="text-sm font-semibold">W</span>
            </div>
            <p className="text-sm font-semibold">SLI Pro admin</p>
          </div>

          <div className="mb-7">
            <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Admin accounts are provisioned by the SLIpro team. If you don't have one, ask
              whoever set up your institution.
            </p>
          </div>

          {notAnAdmin && (
            <div className="mb-6 rounded-lg border border-warn/30 bg-warn-soft p-4">
              <p className="text-sm font-medium text-warn">This is the admin panel</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your sign-in worked, but this account isn't an administrator. Your own Wing
                dashboard is where you want to be.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => navigate("/dashboard")}
              >
                Go to my dashboard
              </Button>
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="email"
                          autoComplete="username"
                          autoFocus
                          placeholder="you@sli.pro"
                          className="pl-9 text-base sm:text-sm"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          placeholder="••••••••"
                          className="px-9 text-base sm:text-sm"
                          {...field}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? (
                            <EyeOffIcon className="h-4 w-4" />
                          ) : (
                            <EyeIcon className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full bg-brand text-white hover:bg-brand/90"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? (
                  <>
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>

              <button
                type="button"
                className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                onClick={() =>
                  toast({
                    title: "Ask the SLIpro team",
                    description:
                      "Admin passwords are reset by hand — there's no self-service flow for staff accounts.",
                  })
                }
              >
                Forgotten your password?
              </button>
            </form>
          </Form>

          <div className="mt-10 flex items-start gap-2.5 border-t pt-6">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              This panel holds student coaching records. Sessions expire after 24 hours, and
              every action is attributed to your account.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
