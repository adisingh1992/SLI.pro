import "dotenv/config";
import { and, desc, eq } from "drizzle-orm";
import { initScript, type ScriptDb } from "../script-init";
import { messageTemplates } from "@shared/wing-schema";

/**
 * Seeds Wing's message templates (Feature List B3).
 *
 * Run:  npm run wing:seed-templates
 *       npm run wing:seed-templates -- --dry-run
 *
 * ── THE COPY IS GOVERNED, NOT INVENTED ───────────────────────────────────
 * Every line below is written against the Wing Voice and Personality Guide,
 * which is the governing document for all platform copy. The rules that bite
 * hardest in email, where the pull toward corporate tone is strongest:
 *
 *   · "we"/"let's" when proposing action; "I" when making an observation.
 *     Wing sees as an individual, acts as a partner.
 *   · Contractions throughout. Colleague over coffee, not career centre.
 *   · Specific over abstract — reference the student's own words and data.
 *   · Confident, not hedging. "Here's what I'm seeing", never "you might
 *     want to consider".
 *
 * And the four anti-patterns, all of which read as natural email copy and are
 * therefore easy to write by accident:
 *
 *   ✗ system notification   "It's been 14 days since your last login"
 *   ✗ career-centre speak   "Build your personal brand"
 *   ✗ hollow enthusiasm     "This is truly amazing!"
 *   ✗ hedging               "You might want to consider…"
 *
 * Templates are versioned and active-flagged, so Danielle can change any of
 * this without a deploy.
 *
 * ── THIS SCRIPT BOOTSTRAPS; THE EDITOR OWNS ──────────────────────────────
 * Once a template exists, /admin/templates is the source of truth and this
 * script leaves it alone. It used to republish whenever the body differed from
 * the copy below — which is precisely what an edit looks like, so the first
 * person to run it after Danielle changed a sentence would have silently
 * reverted her to the seed text. The copy in this file is a starting point, not
 * a spec, and it goes stale by design the moment someone edits in the UI.
 *
 * `--force` restores the seed copy as a new version. Deliberately awkward, and
 * it still versions rather than overwrites, so an unwanted --force is undoable
 * from the history panel.
 */

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

type Seed = {
  templateKey: string;
  channel: "email" | "sms" | "in_app";
  subject?: string;
  body: string;
  /** Why the copy reads this way. Not stored; for whoever edits it next. */
  voiceNote: string;
};

const TEMPLATES: Seed[] = [
  /* ── S1 Welcome sequence — registration, +48h, +5 days ──────────────── */
  {
    templateKey: "welcome_1",
    channel: "email",
    subject: "{{firstName}}, let's find what makes you different",
    body: `Hi {{firstName}},

Most career advice tells you to stand out. Almost none of it tells you what you're actually standing on.

That's what we're going to work out together. Not a headline, not a list of skills — the one thing you do that people would come to you for specifically.

It takes three sessions. The first one is about 8 minutes and it starts with a question most people can't answer cleanly.

{{sessionLink}}

Wing`,
    voiceNote:
      "Trust-crisis framing per B3/S1. Opens on the gap between generic advice and the " +
      "student's actual position — 'seen', not 'onboarded'. No welcome-aboard warmth, no " +
      "feature tour, no exclamation marks.",
  },
  {
    templateKey: "welcome_2",
    channel: "email",
    subject: "The part everyone skips",
    body: `Hi {{firstName}},

Here's the thing I see most often: people describe what they were responsible for, not what they were good at. Those aren't the same, and only one of them is worth building a position on.

Session 1 sorts that out. Eight minutes.

{{sessionLink}}

Wing`,
    voiceNote:
      "'Here's the thing I see' — observation, so 'I'. Specific claim about a real pattern " +
      "rather than a reminder that they have not logged in.",
  },
  {
    templateKey: "welcome_3",
    channel: "email",
    subject: "Still here when you're ready",
    body: `Hi {{firstName}},

No pressure and no countdown. When you've got eight minutes, Session 1 is where we start.

One thing worth knowing: the students who get the most out of this aren't the ones with the best resumes. They're the ones willing to be specific about what they actually did.

{{sessionLink}}

Wing`,
    voiceNote:
      "Third and last of the welcome sequence. Explicitly removes urgency — the anti-pattern " +
      "here would be a deadline or a 'don't miss out'.",
  },

  /* ── S2 Session completion — within the hour ────────────────────────── */
  {
    templateKey: "session_complete_1",
    channel: "email",
    subject: "You locked in {{primaryFunction}}",
    body: `Hi {{firstName}},

You just committed to {{primaryFunction}} as your primary function. That's harder than it sounds — most people hedge across three.

What I noticed: {{insight}}

Next is Session 2, where we find the proof. Claims are easy. Evidence someone would bet on is the part that makes a position hold.

{{nextSessionLink}}

Wing`,
    voiceNote:
      "'What I noticed' is the observation voice and the whole value proposition. Requires a " +
      "real insight from the session artifact — if {{insight}} is unresolved the send warns, " +
      "because generic praise here would be exactly the hollow-enthusiasm anti-pattern.",
  },
  {
    templateKey: "session_complete_2",
    channel: "email",
    subject: "Your evidence is stronger than your headline",
    body: `Hi {{firstName}},

Session 2 done. You've got claims with proof behind them now, which puts you ahead of most people applying for the same roles.

What I noticed: {{insight}}

Session 3 is the one people remember. We take what you've proved and turn it into the story you'll actually tell.

{{nextSessionLink}}

Wing`,
    voiceNote: "Affirming register — ongoing engagement leads with affirmation per the trait hierarchy.",
  },
  {
    templateKey: "session_complete_3",
    channel: "email",
    subject: "That's your SLI",
    body: `Hi {{firstName}},

Three sessions in, and you've got something most people never write down: a position that's specific, provable, and yours.

{{sliStatement}}

Keep it somewhere you'll see it. It'll change — that's the point — but this is the version you built from evidence rather than from what sounded good.

Let's put it to work.

{{dashboardLink}}

Wing`,
    voiceNote:
      "E5 completion celebration. 'Let's put it to work' — collaborative voice for the action. " +
      "Celebration without confetti; the achievement is stated plainly and that carries it.",
  },

  /* ── S3 Dormancy — day 14, 19, 24, then silence ─────────────────────── */
  {
    templateKey: "dormancy_1",
    channel: "email",
    subject: "Your Wing wants to hear what's up",
    body: `Hi {{firstName}},

It's been a bit. What's happened since we last talked — any interviews, any conversations that went somewhere unexpected?

Even a couple of sentences helps me keep track of how your positioning is actually landing.

{{dashboardLink}}

Wing`,
    voiceNote:
      "Warm and playful per B3/S3, and the subject line is lifted from the spec. Note what it " +
      "is NOT: 'It's been 14 days since your last login' is the system-notification " +
      "anti-pattern named in the Voice Guide.",
  },
  {
    templateKey: "dormancy_2",
    channel: "email",
    subject: "Wing wants to promote you",
    body: `Hi {{firstName}},

I can't talk you up if I don't know what you've been doing.

Tell me one thing from the last couple of weeks — something you built, fixed, figured out, or got told no about. Any of those is useful.

{{dashboardLink}}

Wing`,
    voiceNote:
      "Second nudge, spec's own line. 'Got told no' included deliberately — setbacks are " +
      "material, and saying so is the empathising register.",
  },
  /* ── B1 Advisor snapshot — 24h before the appointment ───────────────── */
  {
    templateKey: "advisor_snapshot",
    channel: "email",
    subject: "{{studentName}} — before your meeting",
    body: `Hi {{advisorName}},

You're meeting {{studentName}} on {{appointmentTime}}. Here's where they are.

{{snapshot}}

That's the positioning work they've done so far, so you can start from strategy rather than from scratch.

Wing`,
    voiceNote:
      "The one template NOT in Wing's student voice — the reader is a career advisor, not a " +
      "student, and buddy register would be wrong. Still Wing's principles: specific, no " +
      "hedging, no filler. The purpose line at the end is the actual value proposition and " +
      "earns its place.",
  },

  /* ── B1 Student prep — at appointment registration ──────────────────── */
  {
    templateKey: "student_prep_incomplete",
    channel: "email",
    subject: "Before your advising appointment",
    body: `Hi {{firstName}},

You've got an advising appointment on {{appointmentDate}}.

Worth doing before then: finish the session you're partway through. Your advisor gets a summary of where your positioning stands, and the more you've worked out, the further the conversation can go.

{{sessionLink}}

Wing`,
    voiceNote:
      "The spec's own framing — 'so your advisor can jump straight to strategy'. Names a " +
      "specific next session rather than telling them to finish their profile, and gives the " +
      "reason rather than the instruction.",
  },
  {
    templateKey: "student_prep_complete",
    channel: "email",
    subject: "Your advisor will see your positioning",
    body: `Hi {{firstName}},

Your appointment's on {{appointmentDate}}, and your advisor will get a summary of your SLI and the work behind it beforehand.

Anything changed since you finished? If something's shifted, let's update it before they read it.

{{dashboardLink}}

Wing`,
    voiceNote:
      "Different ask for a different state — the finished student needs an invitation to " +
      "refresh, not a nudge to start. 'Let's update it' is collaborative voice.",
  },

  {
    templateKey: "dormancy_3",
    channel: "email",
    subject: "I'll stop asking",
    body: `Hi {{firstName}},

This is the last one for now — I'd rather be useful than noisy.

Your SLI is where you left it, and it'll still be there when something happens worth telling me about.

{{dashboardLink}}

Wing`,
    voiceNote:
      "Third and final before silence, per S3 ('After Email 3: silence until next calendar " +
      "touchpoint'). Naming the silence is what keeps it from reading as abandonment.",
  },
];

let db: ScriptDb["db"];
let pool: ScriptDb["pool"];

async function main() {
  ({ db, pool } = await initScript());
  console.log(`\n[templates] seeding${DRY_RUN ? " (DRY RUN)" : ""}\n`);

  let inserted = 0;
  let unchanged = 0;
  let versioned = 0;

  for (const t of TEMPLATES) {
    const [current] = await db
      .select()
      .from(messageTemplates)
      .where(
        and(
          eq(messageTemplates.templateKey, t.templateKey),
          eq(messageTemplates.channel, t.channel as any),
          eq(messageTemplates.active, true),
        ),
      )
      .limit(1);

    // Anything already live is left alone unless forced. Whether it matches the
    // seed copy or not is not this script's business — a difference means
    // someone edited it, which is the feature working.
    if (current && !FORCE) {
      unchanged++;
      continue;
    }

    // Highest ever used, not the active one. After a revert in the editor the
    // active version can be lower than the maximum, and reusing that number
    // collides with the unique (key, channel, version) index.
    const [highest] = await db
      .select({ version: messageTemplates.version })
      .from(messageTemplates)
      .where(
        and(
          eq(messageTemplates.templateKey, t.templateKey),
          eq(messageTemplates.channel, t.channel as any),
        ),
      )
      .orderBy(desc(messageTemplates.version))
      .limit(1);

    const nextVersion = (highest?.version ?? 0) + 1;
    console.log(`  ${t.templateKey.padEnd(22)} v${nextVersion}`);

    if (DRY_RUN) {
      current ? versioned++ : inserted++;
      continue;
    }

    // Retire-never-edit, as everywhere else: a message sent last month must
    // stay explicable by the copy that was live when it went out.
    if (current) {
      await db
        .update(messageTemplates)
        .set({ active: false })
        .where(eq(messageTemplates.id, current.id));
      versioned++;
    } else {
      inserted++;
    }

    await db.insert(messageTemplates).values({
      templateKey: t.templateKey,
      channel: t.channel as any,
      subjectTemplate: t.subject ?? null,
      bodyTemplate: t.body,
      version: nextVersion,
      active: true,
    });
  }

  console.log(
    `\n[templates] ${inserted} new, ${versioned} republished, ${unchanged} left alone.` +
      (DRY_RUN ? "\n[templates] (dry run — nothing written)" : "") +
      `\n[templates] Existing templates are NOT touched — /admin/templates owns them\n` +
      `[templates] once seeded, and the copy in this file goes stale by design.\n` +
      (FORCE
        ? `[templates] --force was used: seed copy republished over whatever was live.\n`
        : `[templates] Use --force to restore the seed copy (versioned, so it is undoable).\n`),
  );

  await pool.end();
}

main().catch((err) => {
  console.error("[templates] failed:", err);
  process.exit(1);
});
