import type { ReactNode, InputHTMLAttributes, ButtonHTMLAttributes } from "react";
import wingMark from "@/assets/wing-mark.png";

/**
 * The signed-out shell, ported from the wing5 prototype.
 *
 * The layout is the design's, kept exactly: a 65% wine panel carrying one headline, and a
 * 35% cream panel holding a 380px form column. The only change is the wordmark — "SLI.pro"
 * is now "MyWing" — and the mark itself is the same asset.
 *
 * `fixedLeftPanel` pins the headline and scrolls the form beside it, for forms taller than
 * the viewport. Unused today; kept because the prop is part of the design and removing it
 * would mean re-deriving it the first time a form grows.
 */

export function WingLogo({ variant = "dark" }: { variant?: "dark" | "light" }) {
  return (
    <div className="flex items-center gap-2">
      <img src={wingMark} alt="" width={816} height={816} className="h-8 w-8 object-contain" />
      <span
        className={`text-[17px] font-medium tracking-tight ${
          variant === "light" ? "text-white" : "text-wine"
        }`}
      >
        MyWing
      </span>
    </div>
  );
}

export function AuthShell({
  children,
  fixedLeftPanel,
}: {
  children: ReactNode;
  fixedLeftPanel?: boolean;
}) {
  return (
    <main className="wing-surface flex min-h-screen w-full flex-col md:flex-row">
      <section
        className={`flex w-full items-center bg-wine px-5 py-10 md:min-h-screen md:w-[65%] md:px-16 md:py-0 ${
          fixedLeftPanel ? "md:fixed md:inset-y-0 md:left-0 md:z-10" : ""
        }`}
      >
        <h1 className="max-w-[16ch] text-[28px] font-normal leading-[1.25] tracking-tight text-white md:text-[52px] md:leading-[1.18]">
          {/*
            * The salmon "Control" is a literal in the design rather than the `salmon`
            * token — #d35c4a, not the palette's #cd5847. Kept as the literal: it is a
            * display colour chosen against the wine panel, and folding it into the token
            * would shift every button that uses salmon by a shade nobody asked for.
            */}
          <span className="text-[#d35c4a]">Control</span> what you are known for.
        </h1>
      </section>

      <section
        className={`flex w-full flex-1 justify-center bg-wing-canvas px-5 py-10 text-forest md:w-[35%] md:px-10 md:py-14 ${
          fixedLeftPanel ? "md:ml-[65%] md:h-screen md:flex-none md:items-start md:overflow-y-auto" : ""
        }`}
      >
        <div
          className={`flex w-full max-w-[380px] flex-col justify-center ${
            fixedLeftPanel ? "md:justify-start" : ""
          }`}
        >
          {children}
        </div>
      </section>
    </main>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="block text-[12px] font-semibold text-midnight">{children}</span>;
}

export function UnderlineInput({
  label,
  error,
  helper,
  required,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | null;
  helper?: string;
}) {
  return (
    <label className="block">
      <FieldLabel>
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-midnight/40">
            *
          </span>
        ) : null}
      </FieldLabel>
      <input
        {...props}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        className="mt-2 w-full border-0 border-b border-wing-border bg-transparent pb-2 text-[13px] text-midnight placeholder:text-sand focus:border-wine focus:outline-none focus:ring-0"
      />
      {error ? (
        <span className="mt-1.5 block text-[12px] text-salmon">{error}</span>
      ) : helper ? (
        <span className="mt-1.5 block text-[10px] uppercase tracking-[0.12em] text-sand">
          {helper}
        </span>
      ) : null}
    </label>
  );
}

export function PrimaryButton({
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`w-full rounded-[2px] px-4 py-4 text-[12px] font-semibold uppercase tracking-[0.22em] text-white transition-opacity ${
        props.disabled ? "cursor-not-allowed bg-wine/45" : "bg-wine hover:opacity-90"
      }`}
    >
      {children}
    </button>
  );
}

/* ── Signup form primitives ───────────────────────────────────────────── */

/** The filled aqua field the signup card uses. Distinct from the login underline. */
export const fieldClass =
  "w-full rounded-lg border border-transparent bg-aqua-light px-3.5 py-2 text-[15px] text-forest placeholder:text-[13px] placeholder:text-midnight/55 focus:border-aqua focus:outline-none";

export function BlockHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-midnight">
      {children}
    </h2>
  );
}

export function CardFieldLabel({
  children,
  optional,
  required,
}: {
  children: ReactNode;
  optional?: boolean;
  required?: boolean;
}) {
  return (
    <span className="mb-1 block text-[12px] font-semibold text-midnight">
      {children}
      {required ? (
        <span aria-hidden="true" className="ml-0.5 font-normal text-midnight/40">
          *
        </span>
      ) : null}
      {optional ? <span className="ml-1.5 font-normal text-midnight/40">(optional)</span> : null}
    </span>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <span className="mt-1 block text-[12px] text-salmon">{message}</span>;
}

export function AquaRule() {
  return <hr className="my-2.5 border-0 border-t border-aqua" />;
}
