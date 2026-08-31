import { forwardRef, memo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

/**
 * The conversation surface, shared by all three places a student talks to Wing:
 * Foundation Sessions, enhancement modules, and the intake.
 *
 * ── WHY THESE ARE SHARED ────────────────────────────────────────────────────
 * The three screens were built at different times and each grew its own copy
 * of the same interaction — bubbles, a thinking indicator, a composer with a
 * mic. Within a single file the copy was doubled again, because a turn in
 * flight rendered through near-identical markup to a turn that had landed.
 * The Foundation Session page carried roughly ninety lines of message JSX to
 * draw two kinds of message.
 *
 * That is not only repetition. It is why the streamed reply and the saved
 * reply could look subtly different, and why a fix to one never reached the
 * others.
 *
 * ── THE DESIGN: A PAGE, NOT A MESSAGING APP ─────────────────────────────────
 * A student spends eight to ten minutes here doing the hardest thinking the
 * product asks of them. The previous styling borrowed from chat apps — avatar
 * discs on every line, both speakers in coloured bubbles, a boxed alert
 * repeating the recommended duration above every turn. All of it competes with
 * the one thing that matters, which is reading a long question carefully and
 * answering it properly.
 *
 * So:
 *
 *   Wing speaks in unboxed prose. Its turns are the substance — several
 *   paragraphs, often a question in bold. Wrapping long prose in a grey
 *   rectangle makes it harder to read and says "notification" when it should
 *   say "page".
 *
 *   The student's words sit in a soft aqua block. They are shorter and they
 *   are interjections, so they benefit from a shape — `aqua-light`, the
 *   MyWing token for exactly this job, not `--primary` (the old sign-in
 *   screen's mint, and now an admin-shared token — see the Tone note below).
 *
 *   No avatars. A small label above each turn does the same work in a
 *   quarter of the space and none of the visual noise.
 *
 *   Hairlines, not borders. Almost everything that was boxed only needed
 *   separating.
 *
 * The measure is capped at ~68 characters. Line length is the single largest
 * lever on reading comfort for prose, and the old layout ran the full width of
 * a desktop window.
 */

/**
 * What kind of thing a surface holds. Drives its accent rule and label tint.
 *
 *   brand   the product's own output — the live conversation, what a session
 *           found. Rendered in `wine`, not `--brand`: this file is shared
 *           only with the (archived, unreachable) Foundation and
 *           enhancement-module pages, and `--brand` is the admin panel's own
 *           accent token — using it here would tint the one live consumer,
 *           intake-chat.tsx, in the admin's mint rather than Wing's palette.
 *           See the note on `--ink`/`--canvas`/`--rule` in index.css.
 *   info    reference material: look at it if you want, ignore it if not
 *   warn    something that needs a decision, like leaving a session early
 *   neutral no claim either way
 */
type Tone = 'neutral' | 'brand' | 'info' | 'warn';

/*
 * The accent rule, in one place.
 *
 * The conversation sheet and the rail cards are meant to read as the same
 * family of object, which only holds if they use the same values. Two copies of
 * `bg-wine/60` in two components is one edit away from being two different
 * colours, and nothing would fail when it happened.
 */
const TONE_BAR: Record<Tone, string> = {
  neutral: 'bg-rule',
  brand: 'bg-wine/60',
  info: 'bg-info/50',
  warn: 'bg-warn/50',
};

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-ink-soft',
  brand: 'text-wine',
  info: 'text-info',
  warn: 'text-warn',
};

/* ── The page frame ───────────────────────────────────────────────────────── */

/**
 * A full-height conversation page.
 *
 * `dvh`, not `vh`. On iOS Safari and Android Chrome `100vh` is the viewport
 * height with the address bar *hidden*, so a `100vh` column is taller than what
 * is actually on screen — and the thing pushed off the bottom is the composer.
 * The student opens the page and cannot see where to type. `dvh` tracks the
 * real visible height as the browser chrome collapses.
 *
 * For a page that already has chrome above it (the Foundation Session has the
 * app nav bar), use the pieces directly and do the height arithmetic there
 * instead.
 */
export function ChatShell({ children }: { children: ReactNode }) {
  return <div className="flex h-[100dvh] flex-col bg-canvas">{children}</div>;
}

/**
 * The title bar.
 *
 * `meta` is the slot for a timer or a step count — deliberately at this level
 * rather than in a side rail, so the same component serves the intake (which
 * has no rail) and a session (which does).
 */
export function ChatHeader({
  title,
  subtitle,
  onBack,
  meta,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  meta?: ReactNode;
}) {
  /*
   * ── THE HEADER SHARES THE PAGE'S GUTTERS, NOT ITS OWN ────────────────────
   * The first version centred this in a `max-w-5xl` container while the two
   * columns beneath it were full-bleed. Nothing lined up with anything: the
   * title started well right of the transcript's left edge and the timer
   * landed in open space short of the rail, so both read as floating rather
   * than as belonging to the columns they label.
   *
   * `px-6` here and `px-6` on the body is the whole fix. A header is a label
   * for the thing under it, and it has to share that thing's grid.
   */
  return (
    <header className="shrink-0 border-b border-rule bg-background">
      <div className="flex w-full items-center gap-3 px-4 py-3 sm:px-6">
        {onBack && (
          <button
            onClick={onBack}
            className="-ml-1 shrink-0 rounded-md p-1.5 text-ink-soft transition-colors hover:bg-muted hover:text-ink"
            aria-label="Back"
            data-testid="button-back-to-overview"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1
            className="truncate text-[15px] font-semibold leading-tight text-ink sm:text-lg"
            data-testid="text-session-title"
          >
            {title}
          </h1>
          {subtitle && (
            <p className="hidden truncate text-[13px] text-ink-soft sm:block">{subtitle}</p>
          )}
        </div>
        {meta && <div className="shrink-0">{meta}</div>}
      </div>
    </header>
  );
}

/**
 * The scrolling transcript.
 *
 * A plain scroll container rather than the shadcn `ScrollArea` it replaced:
 * ScrollArea renders a viewport div that breaks `scrollIntoView` from an
 * element inside it in some browsers, and the whole page depends on
 * follow-the-conversation scrolling working every turn.
 */
export const Transcript = forwardRef<HTMLDivElement, { children: ReactNode }>(
  function Transcript({ children }, ref) {
    return (
      <div ref={ref} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/*
         * ── THE COLUMN WIDTH IS A TRADE, NOT AN OPTIMUM ─────────────────────
         * Two things pull against each other here and there is no value that
         * satisfies both:
         *
         *   wider   the bubbles fill the sheet, so there is no dead margin
         *           beside them — which is what the sheet is for
         *   narrower Wing's lines stay short enough to read comfortably, and
         *           the two speakers sit closer together, since one hugs the
         *           left edge and the other the right
         *
         * `38rem` was too far toward the second: legible and adjacent, but
         * leaving a wide empty margin inside the container. `52rem` fills most
         * of the sheet while keeping Wing's measure at roughly 90 characters —
         * past the classic 75 but well short of the full-window lines this
         * started with.
         *
         * The spacing is deliberately uneven. `space-y-*` here is the gap
         * BETWEEN speakers; the gap within one speaker's own paragraphs is set
         * inside `Prose` and is smaller. Even spacing everywhere is what makes
         * a long transcript hard to skim — the eye needs the turn boundary to
         * be the biggest gap on screen.
         */}
        <div className="mx-auto w-full max-w-[52rem] px-5 py-7 sm:px-6">
          <div className="space-y-8">{children}</div>
        </div>
      </div>
    );
  },
);

/**
 * The sheet the conversation is written on.
 *
 * ── WHY THIS EXISTS AT ALL ───────────────────────────────────────────────────
 * The first pass had the transcript sitting directly on the page with no
 * surface of its own. "Calm" turned into "undefined": white prose on a white
 * background with no edge anywhere, so the column had nothing to belong to and
 * appeared to float.
 *
 * The distinction that was missing is paper against desk. `--canvas` is the
 * desk — barely off-white, doing nothing except making the sheet legible as a
 * sheet. This is still a quiet reading surface; it just has an edge now, which
 * is what tells you where the reading is.
 */
export function Sheet({
  children,
  className,
  tone = 'brand',
}: {
  children: ReactNode;
  className?: string;
  /** Set `none` for a sheet that is not the primary surface on its page. */
  tone?: Tone | 'none';
}) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-rule/70 bg-background shadow-sheet',
        className,
      )}
    >
      {/*
       * The same accent rule the rail cards carry, so the conversation reads as
       * the primary object on the page rather than the one thing without a
       * marking. `brand` because the token means "the product, and anything
       * live or current" — which is exactly what a session in progress is.
       *
       * Outside `Transcript`, so it stays put while the conversation scrolls.
       */}
      {tone !== 'none' && <div className={cn('h-[2px] w-full shrink-0', TONE_BAR[tone])} />}
      {children}
    </div>
  );
}

/* ── One turn ─────────────────────────────────────────────────────────────── */

export function Turn({
  role,
  children,
  label,
  time,
  testId,
}: {
  role: 'user' | 'assistant';
  children: ReactNode;
  label?: string;
  /** Rendered as HH:MM. Seconds are noise on a ten-minute conversation. */
  time?: string | Date | null;
  testId?: string;
}) {
  const isUser = role === 'user';
  const stamp =
    time &&
    new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={cn('flex flex-col', isUser && 'items-end')} data-testid={testId}>
      <div className="mb-1.5 flex items-baseline gap-2 px-0.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-soft">
          {label ?? (isUser ? 'You' : 'Wing')}
        </span>
        {stamp && <span className="text-[11px] tabular-nums text-ink-soft/70">{stamp}</span>}
      </div>

      {/*
       * ── SAME FORM, DIFFERENT MATERIAL ────────────────────────────────────
       * Wing's turns were unboxed at first, on the reasoning that long prose
       * reads better without a container around it. That is true of an essay
       * and wrong here: a coaching turn is two or three short paragraphs, so
       * the asymmetry did not read as "this is the substance" — it read as one
       * speaker having a treatment and the other not.
       *
       * Both are bubbles now, and they are told apart by material rather than
       * by presence:
       *
       *   the student   soft aqua fill, no border — `aqua-light`, and it is theirs
       *   Wing          near-white fill with a hairline, sitting a shade off
       *                 the sheet it is on
       *
       * The mirrored square corner (top-right for the student, top-left for
       * Wing) points at whoever is speaking, so the shape carries the
       * direction and the fill carries the identity.
       *
       * Wing has no width cap of its own. The column above sets the measure
       * now, and two things capping the same width is how they drift apart —
       * one place owns it.
       */}
      {isUser ? (
        <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-aqua-light px-4 py-3">
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink">
            {children}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl rounded-tl-sm border border-rule bg-canvas px-4 py-3.5 text-[15px] leading-[1.7] text-ink">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Wing's reply, rendered as the markdown it is written in.
 *
 * ── THIS WAS BEING SHOWN AS SOURCE ──────────────────────────────────────────
 * Every prompt in `server/prompts/` instructs Wing to emphasise the question
 * it wants answered, and it does — the transcript is full of `**bold**`,
 * `> quoted` positioning statements and numbered lists. All three chat screens
 * rendered it into a `<p>` with `whitespace-pre-wrap`, so a student read:
 *
 *     > **I prioritize the highest-gain, lowest-risk change.**
 *
 * asterisks and all. `react-markdown` and `remark-gfm` have been in
 * package.json the whole time and nothing in `client/src` imported either.
 *
 * The emphasis matters more than it looks. Wing's turns routinely end with a
 * bolded question, and the bold is what separates "the thing to answer" from
 * the two paragraphs of context above it. Losing it costs comprehension, not
 * just polish.
 *
 * ── NO RAW HTML ─────────────────────────────────────────────────────────────
 * `react-markdown` does not render raw HTML unless `rehype-raw` is added, and
 * it is deliberately not added. Model output is untrusted input: it is shaped
 * by the student's own words, and a transcript is replayed into the admin
 * panel where staff read it. Markdown only.
 *
 * Memoised on `content`, because a streaming turn re-renders on every chunk
 * and re-parsing the whole reply per token is the one place this could cost
 * something noticeable.
 */
export const Prose = memo(function Prose({ content }: { content: string }) {
  return (
    <div className="space-y-3">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="leading-[1.7]">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold text-ink">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          /*
           * Wing uses a blockquote for the statement it is proposing the
           * student adopt — the one line they are meant to take away. It gets
           * a brand rule and a little air, so it reads as a pull quote rather
           * than as more prose.
           */
          /*
           * Wing uses a blockquote for the statement it is proposing the
           * student adopt — the one line they are meant to take away.
           *
           * White, now that the bubble around it is tinted: a left rule alone
           * was enough against a plain background, but inside a shaded bubble
           * it needs to lift rather than just indent. This is the sentence the
           * student is being asked to own, so it should look like something
           * handed to them.
           */
          blockquote: ({ children }) => (
            <blockquote className="rounded-lg border-l-2 border-wine bg-background py-2.5 pl-4 pr-3 font-medium text-ink">
              {children}
            </blockquote>
          ),
          ul: ({ children }) => (
            <ul className="list-disc space-y-1.5 pl-5 marker:text-ink-soft/60">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal space-y-1.5 pl-5 marker:text-ink-soft">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-[1.7]">{children}</li>,
          h1: ({ children }) => <p className="font-semibold text-ink">{children}</p>,
          h2: ({ children }) => <p className="font-semibold text-ink">{children}</p>,
          h3: ({ children }) => <p className="font-semibold text-ink">{children}</p>,
          code: ({ children }) => (
            <code className="rounded bg-muted px-1.5 py-0.5 text-[13px]">{children}</code>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-wine underline underline-offset-2"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="border-rule" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

/**
 * Wing, before the first token has arrived.
 *
 * Three dots rather than an empty container: an empty bubble reads as a turn
 * that has already failed. Under `prefers-reduced-motion` the dots hold still
 * and the label carries the meaning instead.
 */
export function Thinking() {
  return (
    <div className="flex flex-col">
      <div className="mb-1.5 flex items-baseline gap-2 px-0.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-soft">
          Wing
        </span>
      </div>
      {/*
       * The same bubble Wing's reply will arrive in, so the first token fills
       * a container that is already there rather than replacing a bare row
       * with one. Nothing on screen jumps at the moment the answer starts.
       */}
      <span
        className="inline-flex w-fit items-center gap-1.5 rounded-2xl rounded-tl-sm border border-rule bg-canvas px-4 py-4"
        aria-label="Wing is thinking"
        role="status"
      >
        {[0, 160, 320].map((delay) => (
          <span
            key={delay}
            className="h-[5px] w-[5px] rounded-full bg-wine/40 motion-safe:animate-pulse"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
    </div>
  );
}

/* ── The composer ─────────────────────────────────────────────────────────── */

export function Composer({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="shrink-0 border-t border-rule bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-3 sm:px-6 sm:py-4">
        {children}
        {note && <div className="mt-2 text-[13px] text-ink-soft">{note}</div>}
      </div>
    </div>
  );
}

/**
 * A quiet elapsed-time readout.
 *
 * Replaces a bordered box plus a full-width `Alert` — which used the
 * `destructive` variant for every phase before completion, so a normal session
 * carried a red-bordered warning panel above the conversation for its entire
 * length, restating the recommended duration on every single turn.
 *
 * Guidance that never changes is not guidance, it is furniture. The number is
 * here because a student may want it; it is small, monospaced and grey, and it
 * takes on colour only when it has something to say.
 */
export function TimeReadout({
  formatted,
  phase,
  className,
}: {
  formatted: string;
  phase: 'initial' | 'warning' | 'overtime' | 'completed';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium tabular-nums',
        phase === 'completed' && 'bg-good-soft text-good',
        phase === 'warning' && 'bg-warn-soft text-warn',
        (phase === 'initial' || phase === 'overtime') && 'text-ink-soft',
        className,
      )}
      data-testid="timer-display"
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          phase === 'completed' ? 'bg-good' : phase === 'warning' ? 'bg-warn' : 'bg-wine/50',
        )}
      />
      {formatted}
    </span>
  );
}

/**
 * The card at the end of a finished session.
 *
 * Kept in the transcript rather than in a side rail, because it is the next
 * thing the student should read after Wing's last turn — and on a phone the
 * rail does not exist at all.
 */
export function OutcomeCard({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-rule bg-background p-5">
      {eyebrow && (
        <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-wine">
          {eyebrow}
        </p>
      )}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {children && <div className="pt-1.5 text-[14px] leading-relaxed text-ink-soft">{children}</div>}
      {action && <div className="flex flex-wrap items-center gap-3 pt-4">{action}</div>}
    </div>
  );
}

/**
 * A group in the side rail — a card, not a heading and a gap.
 *
 * ── WHY A CARD ───────────────────────────────────────────────────────────────
 * These were bare sections separated only by whitespace and a small-caps
 * label. Two or three of them stacked read as one undifferentiated column of
 * text: nothing said where "Credibility areas" stopped and "What this session
 * found" began, so the eye had to parse the labels to find the boundaries.
 *
 * A rail is a set of distinct reference objects, and distinct objects need
 * edges. Same 0.5px hairline and same radius as the sheet, so this is more
 * structure without being more decoration.
 */
export function RailSection({
  title,
  icon,
  tone = 'neutral',
  children,
}: {
  title: string;
  /** Icon node; sits before the title, tinted to match `tone`. */
  icon?: ReactNode;
  /** See `Tone`. Drives the accent rule and the label tint, nothing else — the
   *  card body stays white so the content reads, not the container. */
  tone?: Tone;
  children: ReactNode;
}) {
  const tint = TONE_TEXT[tone];
  const bar = TONE_BAR[tone];

  return (
    <section className="overflow-hidden rounded-xl border border-rule/70 bg-background shadow-raised">
      {/*
       * A 2px rule across the top rather than a tinted card or a coloured
       * border. A rail of three fully-tinted cards competes with the
       * conversation for attention, and the conversation should win; a rule
       * plus a tinted label is enough to tell the cards apart at a glance,
       * which was the actual complaint.
       */}
      <div className={cn('h-[2px] w-full', bar)} />
      <div className="p-4">
        <h2
          className={cn(
            'mb-3 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em]',
            tint,
          )}
        >
          {icon}
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

/**
 * A value that deserves to be looked at rather than read past — the brand
 * claim, the primary function. Tinted block, brand text.
 */
export function RailHighlight({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg bg-aqua-light px-3 py-2.5 text-[14px] font-medium leading-relaxed text-wine">
      {children}
    </div>
  );
}

/**
 * A 0–100 value with a bar.
 *
 * The confidence score was a bare "94%" in a list, which reads as trivia. It
 * is the model's own certainty about the whole session's conclusion, and a bar
 * makes "how much of the way along is that" answerable without arithmetic.
 */
export function RailMeter({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-[0.06em] text-ink-soft">{label}</span>
        <span className="text-[15px] font-medium tabular-nums text-wine">{pct}%</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-aqua-light"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-wine" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * Key/value line in the side rail.
 *
 * Ruled between rows rather than spaced apart. The session results are a list
 * of separate findings — primary function, tier, brand claim — and the brand
 * claim runs to four lines, which made a purely space-separated list ambiguous
 * about where one finding ended and the next began.
 */
export function RailFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-t border-rule/70 py-2.5 first:border-t-0 first:pt-0 last:pb-0">
      <dt className="text-[11px] uppercase tracking-[0.06em] text-ink-soft">{label}</dt>
      <dd className="pt-1 text-[14px] leading-relaxed text-ink">{value}</dd>
    </div>
  );
}
