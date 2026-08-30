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

  /* ── B2 Life log nudge — every 5 days, then weekly ──────────────────── */
  {
    templateKey: "life_log_nudge",
    channel: "email",
    subject: "{{prompt}}",
    body: `{{opener}}

{{prompt}}

Or anything else that's happened — an interview, a conversation that went sideways, something you figured out. Two sentences is plenty.

{{logLink}}

Wing`,
    voiceNote:
      "{{opener}} replaces the greeting rather than sitting above it. Every one of her " +
      "fourteen openers already contains one — \"Hey [Name] — quick one for you.\" — so a " +
      "'Hi {{firstName}},' line above it would greet the student twice. The opener is " +
      "chosen independently of the prompt, per her Integration Notes, so the email feels " +
      "different even when the question comes round again at the 14-day floor. " +
      "The prompt IS the subject line — it is the most interesting thing in the email and " +
      "burying it under 'Your weekly check-in' would waste the one line that gets read in a " +
      "preview pane. The body then explicitly releases them from it ('or anything else'), " +
      "which is the same not-constraining rule the in-app placeholder follows. 'Two sentences " +
      "is plenty' is doing real work: the failure mode for a reflection prompt is implying it " +
      "wants an essay.",
  },

  /* ── The one message a safety hold permits ──────────────────────────── */
  {
    templateKey: "safety_soft_check_in",
    channel: "email",
    /*
     * Her sentence is the subject as well as the body. A subject line that framed it —
     * "Checking in on you", "How are you doing?" — would be the coaching she ruled out,
     * and it is the line that shows in a preview pane whether or not the mail is opened.
     */
    subject: "I'm here when you're ready.",
    body: `Hi {{firstName}},

I'm here when you're ready.

Wing`,
    voiceNote:
      "Her ruling, verbatim: \"If the user hasn't returned after 30 days, Wing sends one " +
      "soft check-in — not coaching, not a prompt. 'I'm here when you're ready.' That's " +
      "the only automated contact during a hold.\" " +
      "So there is no question in it, nothing to do, no link, and no next step — a link " +
      "back into the app is a prompt wearing a different coat. It names no service and " +
      "offers no resource, because Wing does not know what is available to this person " +
      "and inventing one would be worse than saying nothing. " +
      "It is short because the length is the message: anything longer starts explaining " +
      "itself, and a person who has been away for a month did not ask for an explanation.",
  },

  /* ── E1 Life-event follow-up — 24h after a log entry ────────────────── */
  {
    templateKey: "event_followup_career",
    channel: "email",
    subject: "What came of it?",
    body: `Hi {{firstName}},

You wrote this yesterday:

"{{entryExcerpt}}"

What happened next? Even if the answer is nothing yet — that's information too.

{{logLink}}

Wing`,
    voiceNote:
      "Quotes them back, which is the entire justification for a second message — Wing already " +
      "replied when they wrote it. A day later the useful question is what came of it. " +
      "'Even if the answer is nothing yet' matters: without it, someone whose interview went " +
      "quiet has a reason not to reply, and those are exactly the weeks worth capturing.",
  },
  {
    templateKey: "event_followup_personal",
    channel: "email",
    subject: "Still thinking about this one",
    body: `Hi {{firstName}},

You wrote:

"{{entryExcerpt}}"

I've been turning it over. Anything shifted since — or does it still sit the same way?

{{logLink}}

Wing`,
    voiceNote:
      "Personal entries get a slower register than career ones. 'I've been turning it over' is " +
      "the observation voice and it is doing the work the career version does with 'what " +
      "happened next' — which would be the wrong question about something personal.",
  },

  /* ── E2 Internship milestones — day 30 and day 60 ───────────────────── */
  {
    templateKey: "internship_day_30",
    channel: "email",
    subject: "A month in",
    body: `Hi {{firstName}},

Thirty days. You know things now you didn't on day one, and most of them will be gone from memory by September if you don't write them down.

Two questions worth answering while it's fresh: what did you turn out to be good at that surprised you, and what did you get handed because someone trusted you with it?

Both are evidence. Neither survives the summer in your head.

{{logLink}}

Wing`,
    voiceNote:
      "The urgency is real and specific rather than manufactured — internship detail genuinely " +
      "evaporates, and this is the moment it is still recoverable. Two questions, both aimed at " +
      "evidence the portfolio can use, rather than 'how's it going'.",
  },
  {
    templateKey: "internship_day_60",
    channel: "email",
    subject: "Two months — what would you put on a CV?",
    body: `Hi {{firstName}},

Sixty days in, so you can see the shape of it now.

If you had to put one line about this internship on a CV, what would it say? Not the job description — the thing you actually did that someone would hire you for.

If that's hard to answer, that's the useful finding, and it's worth fixing while you're still there.

{{portfolioLink}}

Wing`,
    voiceNote:
      "Day 60 asks a harder question than day 30 on purpose — there is still time to act on the " +
      "answer. 'If that's hard to answer, that's the useful finding' is the anti-flattery rule: " +
      "the difficulty is the insight, and softening it would waste the last month.",
  },

  /* ── S5 90-Day Positioning Launch — one template, twelve weeks ──────── */
  {
    templateKey: "positioning_launch_week",
    channel: "email",
    subject: "Week {{weekNumber}}: {{weekTheme}}",
    body: `Hi {{firstName}},

Week {{weekNumber}} of twelve.

{{weekPrompt}}

{{draftsLink}}

Wing`,
    voiceNote:
      "ONE template for all twelve weeks — the theme and prompt are variables, held in " +
      "LAUNCH_WEEKS in event-sequences.ts. Twelve near-identical templates would mean twelve " +
      "places to edit the sign-off and twelve chances for the voice to drift. Deliberately " +
      "short: the prompt is the message, and framing around it would bury it.",
  },

  /* ── S4 Academic calendar — completion-aware variants ───────────────── */
  {
    templateKey: "calendar_touchpoint_incomplete",
    channel: "email",
    subject: "{{eventLabel}} — worth being ready",
    body: `Hi {{firstName}},

{{eventLabel}} is here.

This is the stretch where being able to say what you do — clearly, in one sentence — starts to matter more than it did last month. You're {{sessionsCompleted}} of 3 sessions in.

The next one takes about ten minutes.

{{sessionLink}}

Wing`,
    voiceNote:
      "The variant for someone who has not finished. Names where they actually are rather than " +
      "generically nudging, and gives the real time cost. No deadline language — the calendar " +
      "event supplies the urgency, and adding more would tip into pressure.",
  },
  {
    templateKey: "calendar_touchpoint_complete",
    channel: "email",
    subject: "{{eventLabel}} — you're ready for this",
    body: `Hi {{firstName}},

{{eventLabel}} is here, and you've done the work — all three sessions, positioning written down.

So this week is about using it rather than building it. Your SLI is the answer to the first question anyone asks you.

{{dashboardLink}}

Wing`,
    voiceNote:
      "Same event, different job. This one affirms and redirects to using the work; the " +
      "incomplete variant asks them to do it. Sending either to the wrong group is what makes " +
      "calendar mail read as a mailing list rather than as something aimed at them.",
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
