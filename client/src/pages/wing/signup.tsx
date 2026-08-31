import { useState, type FormEvent } from "react";
import { Link, Redirect } from "wouter";
import { Eye, EyeOff } from "lucide-react";
import {
  AquaRule,
  BlockHeading,
  CardFieldLabel,
  FieldError,
  WingLogo,
  fieldClass,
} from "@/components/wing/AuthShell";
import { useAuth } from "@/hooks/use-auth";
import { INSTITUTION_NAME } from "@/lib/wing-config";

/**
 * Create your account. The wing5 card, kept as designed.
 *
 * ── THE DEMOGRAPHIC BLOCK IS REAL NOW ────────────────────────────────────
 * The prototype collected age, gender, race/ethnicity and the marketing opt-in under a
 * promise — "Collected for {Institution} reporting. Does not affect your Wing experience"
 * — and then dropped them: `// Registration data is validated and discarded`.
 *
 * They go to `wing.student_demographics` (migration 0035), which is deliberately a
 * separate table from the student profile the coaching prompts read. That separation is
 * the promise the copy makes, and it is worth having in the schema rather than in a
 * convention someone can forget: nothing that assembles a prompt joins that table.
 *
 * ── AND `professionalStatus` IS NOT ASKED HERE ───────────────────────────
 * It is required by the API and it is load-bearing — it selects the prompt strategy and
 * resolves the population tags. The design does not ask for it, and the design is right:
 * Wing establishes it during intake (`intake-conversation.ts` writes it when the
 * conversation surfaces it), which is the whole shape of the new product. So the register
 * schema now takes it as optional and intake fills it in.
 */
const GENDERS = ["Woman", "Man", "Non-binary", "Prefer to self-describe", "Prefer not to say"];

const ETHNICITIES = [
  "American Indian or Alaska Native",
  "Asian",
  "Black or African American",
  "Hispanic or Latino",
  "Native Hawaiian or Other Pacific Islander",
  "White",
  "Two or more races",
  "Prefer not to say",
];

const REFERRALS = ["Career center", "Professor", "Friend", "Email", "Social media", "Other"];

/** The design's labels, mapped to the `discovery_source` enum the API stores. */
const REFERRAL_VALUE: Readonly<Record<string, string>> = {
  "Career center": "university_partnership",
  Professor: "colleague_or_mentor",
  Friend: "colleague_or_mentor",
  Email: "other",
  "Social media": "linkedin",
  Other: "other",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function WingSignupPage() {
  const { user, registerMutation } = useAuth();

  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<string | null>(null);
  const [selfDescribe, setSelfDescribe] = useState("");
  const [ethnicities, setEthnicities] = useState<string[]>([]);
  const [referral, setReferral] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [updates, setUpdates] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (user) return <Redirect to="/" />;

  const toggleEthnicity = (value: string) =>
    setEthnicities((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};

    if (!first.trim()) next.first = "Required";
    if (!last.trim()) next.last = "Required";
    if (!email.trim()) next.email = "Required";
    else if (!EMAIL_RE.test(email.trim())) next.email = "Please enter a valid email";

    /*
     * The API's password rules, checked here so a student sees which one they missed
     * beside the field rather than as one sentence after a round trip.
     */
    if (!password) next.password = "Required";
    else if (password.length < 8) next.password = "At least 8 characters";
    else if (!/\d/.test(password)) next.password = "Include a number";
    else if (!/[a-z]/.test(password)) next.password = "Include a lowercase letter";
    else if (!/[A-Z]/.test(password)) next.password = "Include a capital letter";

    const ageNum = Number(age);
    if (!age.trim()) next.age = "Required";
    else if (!Number.isFinite(ageNum) || ageNum < 16) next.age = "Enter an age of 16 or above";

    if (!gender) next.gender = "Required";
    else if (gender === "Prefer to self-describe" && !selfDescribe.trim())
      next.gender = "Please describe";

    if (ethnicities.length === 0) next.ethnicity = "Required";
    if (!privacy) next.privacy = "Required";

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    registerMutation.mutate({
      username: email.trim(),
      password,
      confirmPassword: password,
      firstName: first.trim(),
      lastName: last.trim(),
      ...(phone.trim() ? { phoneNumber: phone.trim() } : {}),
      ...(referral ? { discoverySource: REFERRAL_VALUE[referral] ?? "other" } : {}),
      ...(referral === "Other" || referral === "Email"
        ? { discoverySourceOther: referral }
        : {}),
      demographics: {
        age: ageNum,
        gender,
        genderSelfDescribe: gender === "Prefer to self-describe" ? selfDescribe.trim() : null,
        ethnicities,
        marketingOptIn: updates,
      },
    } as never);
  };

  return (
    <main className="wing-surface relative flex min-h-screen w-full flex-col items-center justify-start bg-wine px-5 py-4 text-white md:pt-[56px]">
      <div className="mb-4 flex w-full items-center justify-between md:fixed md:inset-x-0 md:top-0 md:z-20 md:mb-0 md:px-5 md:pt-5">
        <WingLogo variant="light" />
        <Link href="/auth" className="text-[13px] text-white/80">
          Already a member?{" "}
          <span className="font-semibold text-white underline-offset-2 hover:underline">
            Log In
          </span>
        </Link>
      </div>

      <form
        onSubmit={submit}
        noValidate
        className="mt-1 w-full max-w-[880px] rounded-xl border border-wing-border bg-white px-6 py-4 shadow-sm md:px-10"
      >
        <BlockHeading>Your details</BlockHeading>
        <div className="mt-2.5 grid grid-cols-1 gap-x-5 gap-y-2.5 md:grid-cols-2">
          <label className="block">
            <CardFieldLabel required>First name</CardFieldLabel>
            <input
              className={fieldClass}
              placeholder="John"
              autoComplete="given-name"
              value={first}
              onChange={(e) => setFirst(e.target.value)}
            />
            <FieldError message={errors.first} />
          </label>

          <label className="block">
            <CardFieldLabel required>Last name</CardFieldLabel>
            <input
              className={fieldClass}
              placeholder="Doe"
              autoComplete="family-name"
              value={last}
              onChange={(e) => setLast(e.target.value)}
            />
            <FieldError message={errors.last} />
          </label>

          <label className="block">
            <CardFieldLabel required>Email</CardFieldLabel>
            <input
              type="email"
              className={fieldClass}
              placeholder="name@university.edu"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <FieldError message={errors.email} />
          </label>

          <label className="block">
            <CardFieldLabel required>Password</CardFieldLabel>
            <span className="relative block">
              <input
                type={showPassword ? "text" : "password"}
                className={`${fieldClass} pr-10`}
                placeholder="Create password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-midnight/50 transition-opacity hover:opacity-80"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
            <FieldError message={errors.password} />
          </label>

          <label className="block">
            <CardFieldLabel optional>Phone</CardFieldLabel>
            <input
              className={fieldClass}
              placeholder="(123) 456-7890"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <span className="mt-1 block text-[11px] text-midnight/45">
              For SMS notifications. Optional
            </span>
          </label>

          <label className="block">
            <CardFieldLabel required>Age</CardFieldLabel>
            <input
              type="number"
              min={16}
              className={fieldClass}
              placeholder="Your age"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
            <FieldError message={errors.age} />
          </label>
        </div>

        <AquaRule />

        <BlockHeading>A few things {INSTITUTION_NAME} asks us to collect</BlockHeading>
        <p className="mt-1 text-[12px] text-midnight/50">
          Collected for {INSTITUTION_NAME} reporting. Does not affect your Wing experience.
        </p>

        <div className="mt-2.5 grid grid-cols-1 gap-x-5 gap-y-2.5 md:grid-cols-2">
          <fieldset className="md:col-span-2">
            <legend className="mb-2 text-[12px] font-semibold text-midnight">
              Gender identity
              <span aria-hidden="true" className="ml-0.5 font-normal text-midnight/40">
                *
              </span>
            </legend>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 md:flex md:flex-nowrap md:items-center md:justify-between md:gap-x-4">
              {GENDERS.map((g) => (
                <label key={g} className="flex cursor-pointer items-center gap-2.5 py-0.5">
                  <input
                    type="radio"
                    name="gender"
                    value={g}
                    checked={gender === g}
                    onChange={() => setGender(g)}
                    className="h-3.5 w-3.5 shrink-0 accent-midnight"
                  />
                  <span className="text-[12px] font-medium leading-snug text-midnight md:whitespace-nowrap">
                    {g}
                  </span>
                </label>
              ))}
            </div>
            {gender === "Prefer to self-describe" ? (
              <input
                className={`${fieldClass} mt-2 md:max-w-[320px]`}
                placeholder="Describe your gender identity"
                value={selfDescribe}
                onChange={(e) => setSelfDescribe(e.target.value)}
              />
            ) : null}
            <FieldError message={errors.gender} />
          </fieldset>

          <fieldset className="md:col-span-2">
            <legend className="mb-2 text-[12px] font-semibold text-midnight">
              Race / Ethnicity
              <span aria-hidden="true" className="ml-0.5 font-normal text-midnight/40">
                *
              </span>
            </legend>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 md:grid-cols-3">
              {ETHNICITIES.map((eth) => (
                <label key={eth} className="flex cursor-pointer items-center gap-2.5 py-0.5">
                  <input
                    type="checkbox"
                    checked={ethnicities.includes(eth)}
                    onChange={() => toggleEthnicity(eth)}
                    className="h-3.5 w-3.5 shrink-0 accent-midnight"
                  />
                  <span className="text-[12px] font-medium leading-snug text-midnight">{eth}</span>
                </label>
              ))}
            </div>
            <FieldError message={errors.ethnicity} />
          </fieldset>
        </div>

        <AquaRule />

        <BlockHeading>Before you start</BlockHeading>
        <div className="mt-2.5 grid grid-cols-1 gap-x-5 gap-y-2.5 md:grid-cols-2">
          <label className="block">
            <CardFieldLabel optional>How did you hear about Wing?</CardFieldLabel>
            <select
              className={`${fieldClass} pr-10 ${referral ? "" : "text-[13px] text-midnight/40"}`}
              value={referral}
              onChange={(e) => setReferral(e.target.value)}
            >
              <option value="">Select one</option>
              {REFERRALS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col justify-start gap-3 md:pt-5">
            <div>
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={privacy}
                  onChange={(e) => setPrivacy(e.target.checked)}
                  className="h-3.5 w-3.5 shrink-0 accent-midnight"
                />
                <span className="text-[13px] text-midnight">
                  I acknowledge the{" "}
                  <a href="#privacy" className="underline decoration-salmon underline-offset-2">
                    privacy policy
                  </a>
                  <span aria-hidden="true" className="ml-0.5 text-midnight/40">
                    *
                  </span>
                </span>
              </label>
              <FieldError message={errors.privacy} />
            </div>

            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={updates}
                onChange={(e) => setUpdates(e.target.checked)}
                className="h-3.5 w-3.5 shrink-0 accent-midnight"
              />
              <span className="text-[13px] text-midnight">I&rsquo;d like to receive updates</span>
            </label>
          </div>
        </div>

        {registerMutation.isError && (
          <p className="mt-4 text-[12px] text-salmon">
            {registerMutation.error.message || "That didn't go through."}
          </p>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={registerMutation.isPending}
            className="rounded-[2px] bg-salmon px-6 py-2.5 text-[12px] font-semibold uppercase tracking-[0.22em] text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {registerMutation.isPending ? "Creating…" : "Create my account"}
          </button>
        </div>
      </form>
    </main>
  );
}
