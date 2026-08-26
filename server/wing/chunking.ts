/**
 * Chunked delivery and the reveal pause — H-007, and Q8's beat.
 *
 * Pure. Decides how a reply is broken up and how long the gaps are; sends nothing.
 *
 * ── WHY THIS IS A MODULE AND NOT A PROMPT INSTRUCTION ────────────────────
 * H-007's own note asks for it: "Consider implementing as system-level behavior rather
 * than per-card heuristic." And Intake Design v3.3 is firmer still — "Message delivery
 * follows H-007 (chunked messaging): three to four short messages rather than a wall of
 * text, arriving with the rhythm of someone typing. This governs the intake surface
 * throughout and is a design requirement, not a preference."
 *
 * A model told to "send three messages" sends one message with two blank lines in it.
 * The split has to be a decision the code makes about text the model produced, which is
 * also the only version that can be tested.
 *
 * ── THE RULE THAT MATTERS MOST ───────────────────────────────────────────
 * H-007's success criterion is behavioural: "Student engages with the prompt rather than
 * asking 'wait, what are we doing?' Observable: student responds to the final prompt
 * message, not to the framing messages."
 *
 * So a trailing question is always its own last chunk. That is not a formatting
 * preference — it is the whole mechanism. H-010 shows the same shape: "Message 3: Q1".
 * A question buried in the middle of a paragraph of framing is the failure the card
 * exists to prevent.
 *
 * ── AND THE ONE PEOPLE FORGET ────────────────────────────────────────────
 * H-007's failure path: "If student skips ahead before Wing finishes the sequence →
 * adapt and follow their lead rather than insisting on completing the welcome sequence."
 * Delivery is abortable. A queue that keeps flushing after the user has started typing
 * is worse than no chunking at all, because it talks over them.
 *
 * ── THE FOUR NUMBERS ARE OURS ────────────────────────────────────────────
 * She specifies "pause between messages" and "the rhythm of someone typing" and gives no
 * durations anywhere. The four constants below are ours, named so they are easy to find
 * and easy to argue with. The one that is hers in spirit is the reveal pause: "After the
 * reveal, Wing pauses. The pause is the product. The user needs a beat to process being
 * seen." Whatever that number is, it is longer than a typing gap.
 */

/** Ours. A fast typist, tuned for a chat product rather than for realism. */
export const TYPING_CHARS_PER_SECOND = 60;
/** Ours. Below this the gap reads as a rendering glitch rather than a pause. */
export const MIN_PAUSE_MS = 500;
/** Ours. Above this the user wonders whether it broke. */
export const MAX_PAUSE_MS = 2500;
/**
 * Ours, and the one with a reason behind it. v3.3: "After the reveal, Wing pauses. The
 * pause is the product." It has to be longer than any typing gap or it is not a pause,
 * it is just the next message being slow.
 */
export const REVEAL_PAUSE_MS = 4000;

/** H-007: "Break information into 3-4 short messages (2-3 sentences each)." */
export const SENTENCES_PER_CHUNK = 3;
export const MAX_CHUNKS = 4;

/**
 * Below this, a reply is one message. H-007 fires on "multi-part information (recap +
 * context + instructions + prompt)" — not on every sentence Wing ever says. Chopping a
 * two-sentence answer into three messages is the cargo-cult version of this card.
 */
export const MIN_SENTENCES_TO_CHUNK = 4;

export type Chunk = {
  text: string;
  /** Milliseconds to wait before sending this one. Zero for the first. */
  pauseBeforeMs: number;
  /** True when this chunk is the question the user is meant to answer. */
  isQuestion: boolean;
};

export type ChunkPlan = {
  chunks: Chunk[];
  /** Sum of the gaps. Worth watching against v3.3's 7–8 minute intake budget. */
  totalPauseMs: number;
  /** The beat after the last chunk. Non-zero only for a reveal. */
  pauseAfterMs: number;
  /**
   * True when the text would not fit in MAX_CHUNKS at the target size, so the last chunk
   * absorbed the remainder. Not an error — a signal that Wing wrote too much, which is a
   * voice problem rather than a delivery one.
   */
  tooLong: boolean;
};

/* ── Sentence splitting ─────────────────────────────────────────────────── */

const ABBREVIATIONS = ["e.g.", "i.e.", "etc.", "mr.", "mrs.", "ms.", "dr.", "vs.", "no.", "u.s."];

/**
 * Splits into sentences without breaking a quotation.
 *
 * The quotation guard is load-bearing rather than tidy. Wing's reveal quotes the user's
 * exact words — IG-U010 quote-then-extend, and IG-INT10 and IG-INT12 require the literal
 * typed input in the slot. A split inside the quotation marks delivers half of what
 * someone said as though it were the whole thing, in the one message designed to prove
 * Wing was listening.
 */
export function splitSentences(text: string): string[] {
  const t = text.trim();
  if (!t) return [];

  const out: string[] = [];
  let current = "";
  let inQuote = false;

  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    current += ch;

    if (isQuoteChar(ch)) {
      inQuote = !inQuote;
      continue;
    }

    if (ch !== "." && ch !== "!" && ch !== "?") continue;

    /*
     * Take any closing quote or bracket with the terminator. This is the case the naive
     * guard gets wrong: in `You said "…it gets exhausting." That is…`, the full stop
     * sits INSIDE the quotation marks and ends the outer sentence as well. Refusing to
     * split there merges the quotation with everything after it; splitting one character
     * earlier cuts the user's words in half. Both are wrong, and the closing mark is
     * what tells them apart.
     */
    let j = i + 1;
    let closed = false;
    while (j < t.length && (isQuoteChar(t[j]) || t[j] === ")" || t[j] === "'")) {
      current += t[j];
      if (isQuoteChar(t[j])) {
        inQuote = false;
        closed = true;
      }
      j++;
    }
    i = j - 1;

    if (inQuote && !closed) continue; // genuinely mid-quotation
    const rest = t.slice(j);
    if (rest !== "" && !/^\s/.test(rest)) continue; // a decimal, or a url
    if (isAbbreviation(current)) continue;

    out.push(current.trim());
    current = "";
  }

  if (current.trim()) out.push(current.trim());
  return out;
}

function isQuoteChar(ch: string): boolean {
  return ch === '"' || ch === "\u201c" || ch === "\u201d";
}

function isAbbreviation(sentence: string): boolean {
  const tail = sentence.trim().toLowerCase();
  for (const a of ABBREVIATIONS) {
    if (tail.length >= a.length && tail.slice(tail.length - a.length) === a) return true;
  }
  // A single capital letter and a dot — an initial, not a sentence end.
  return /(?:^|\s)[A-Za-z]\.$/.test(sentence.trim());
}

function isQuestionText(s: string): boolean {
  return s.trim().slice(-1) === "?";
}

/* ── The plan ───────────────────────────────────────────────────────────── */

function pauseFor(text: string): number {
  const ms = Math.round((text.length / TYPING_CHARS_PER_SECOND) * 1000);
  if (ms < MIN_PAUSE_MS) return MIN_PAUSE_MS;
  if (ms > MAX_PAUSE_MS) return MAX_PAUSE_MS;
  return ms;
}

/**
 * How to deliver one reply.
 *
 * `kind` changes two things and nothing else: a reveal gets the beat afterwards, and its
 * text is never merged into a bigger chunk with framing around it.
 */
export function planChunks(text: string, opts?: { kind?: "reply" | "reveal" }): ChunkPlan {
  const kind = opts?.kind ?? "reply";
  const sentences = splitSentences(text);

  if (!sentences.length) {
    return { chunks: [], totalPauseMs: 0, pauseAfterMs: 0, tooLong: false };
  }

  /*
   * A trailing question is peeled off first and delivered alone, whatever else happens
   * to the rest. This is the success criterion, not a nicety.
   */
  let question: string | null = null;
  const body = sentences.slice();
  if (isQuestionText(body[body.length - 1])) {
    question = body.pop() as string;
  }

  const groups: string[][] = [];

  if (body.length) {
    if (body.length < MIN_SENTENCES_TO_CHUNK && !question) {
      groups.push(body);
    } else {
      const bodyChunkBudget = question ? MAX_CHUNKS - 1 : MAX_CHUNKS;
      for (let i = 0; i < body.length; i += SENTENCES_PER_CHUNK) {
        if (groups.length === bodyChunkBudget) {
          // Out of room: everything left joins the last group rather than being dropped.
          const last = groups[groups.length - 1];
          for (let j = i; j < body.length; j++) last.push(body[j]);
          break;
        }
        groups.push(body.slice(i, i + SENTENCES_PER_CHUNK));
      }
    }
  }

  const chunks: Chunk[] = [];
  for (const g of groups) {
    const t = g.join(" ");
    chunks.push({
      text: t,
      pauseBeforeMs: chunks.length === 0 ? 0 : pauseFor(t),
      isQuestion: false,
    });
  }
  if (question) {
    chunks.push({
      text: question,
      pauseBeforeMs: chunks.length === 0 ? 0 : pauseFor(question),
      isQuestion: true,
    });
  }

  let totalPauseMs = 0;
  for (const c of chunks) totalPauseMs += c.pauseBeforeMs;

  const wanted = Math.ceil(body.length / SENTENCES_PER_CHUNK) + (question ? 1 : 0);

  return {
    chunks,
    totalPauseMs,
    pauseAfterMs: kind === "reveal" ? REVEAL_PAUSE_MS : 0,
    tooLong: wanted > MAX_CHUNKS,
  };
}

/**
 * The reveal, as three messages with the beat in the right place.
 *
 * v3.3, Q8: Wing says "I want to pause for a second, because I'm noticing something."
 * Then the reveal, 2–4 sentences, never longer. Then the pause. Then Q9, the deepening
 * question, which each template carries.
 *
 * The marker line is a separate message on purpose — it is the thing that makes the
 * reveal feel like Wing stopping rather than Wing continuing, and merged into the reveal
 * body it stops doing that.
 */
export function planReveal(params: { marker: string; reveal: string; deepening: string }): ChunkPlan {
  const marker: Chunk = { text: params.marker.trim(), pauseBeforeMs: 0, isQuestion: false };
  const revealText = params.reveal.trim();
  const body: Chunk = {
    text: revealText,
    pauseBeforeMs: pauseFor(revealText),
    isQuestion: false,
  };
  const deepening: Chunk = {
    text: params.deepening.trim(),
    /*
     * The beat lives here rather than in `pauseAfterMs`, because "after the reveal" is
     * the gap the user sits in — and the thing on the far side of it is Q9. A pause
     * recorded after the last message is a pause nobody experiences.
     */
    pauseBeforeMs: REVEAL_PAUSE_MS,
    isQuestion: isQuestionText(params.deepening),
  };

  return {
    chunks: [marker, body, deepening],
    totalPauseMs: body.pauseBeforeMs + deepening.pauseBeforeMs,
    pauseAfterMs: 0,
    tooLong: splitSentences(revealText).length > 4,
  };
}

/**
 * What is left to send once the user has spoken.
 *
 * H-007's failure path: "If student skips ahead before Wing finishes the sequence →
 * adapt and follow their lead rather than insisting on completing the welcome sequence."
 * So: nothing. The queue is dropped, the turn ends, and Wing answers what they said.
 *
 * Returned as an array rather than a boolean so a caller can log what was dropped —
 * a reveal abandoned halfway is worth seeing in a transcript.
 */
export function remainingAfterInterruption(plan: ChunkPlan, delivered: number): Chunk[] {
  if (delivered >= plan.chunks.length) return [];
  return plan.chunks.slice(delivered);
}

/** Always empty: the user speaking ends the sequence. */
export function continueAfterInterruption(): Chunk[] {
  return [];
}

/* ── Streaming ──────────────────────────────────────────────────────────── */

/**
 * The same rule, applied to text that arrives a token at a time.
 *
 * ── WHY A SECOND ENTRY POINT AND NOT A SECOND IMPLEMENTATION ─────────────
 * `planChunks` needs the whole reply — it peels the trailing question off the end, and
 * the end is exactly what a stream does not have yet. The Foundation turn streams with
 * `maxTokens: 4096`, so buffering to completion before showing anything would replace a
 * fast first token with a long silence on the platform's most quality-critical surface.
 *
 * So this decides breaks as the text arrives, and shares `splitSentences`, the pause
 * arithmetic and every constant with `planChunks`. What it must never become is a
 * paraphrase of the splitting rule: the quotation guard is load-bearing — the reveal
 * quotes the user's literal words per IG-U010 — and two implementations of it will
 * eventually disagree about a full stop inside a closing quote.
 *
 * ── WHAT CHANGES, AND WHY IT IS STILL H-007 ──────────────────────────────
 * Two of `planChunks`'s rules cannot be applied without the end of the text, and both
 * come out right anyway:
 *
 * - **The short-reply rule.** `MIN_SENTENCES_TO_CHUNK` says a two-sentence reply is not
 *   chopped up. A break here can only fire once enough sentences have arrived, so a short
 *   reply simply never triggers one and renders as a single message. The rule is
 *   satisfied by construction rather than by checking.
 * - **The trailing question.** `planChunks` peels the LAST sentence when it is a
 *   question. Mid-stream nothing is known to be last, so this breaks before ANY completed
 *   question. That is the same outcome for the case the success criterion is about — the
 *   student answers the final message rather than the framing — and for a question that
 *   turns out not to be last, giving it its own message is what IG-UX02 asks for anyway.
 */
export type StreamChunker = {
  /** Feed the next delta. Returns any chunks that just became complete. */
  push(delta: string): Chunk[];
  /** Flush what is left when the stream ends. */
  end(): Chunk[];
  /** True once the reply has outgrown MAX_CHUNKS, so the caller can log it. */
  tooLong(): boolean;
};

export function streamChunker(): StreamChunker {
  let buffer = "";
  let emitted = 0;
  let over = false;

  /** Sentences that are definitely finished — the last one may still be growing. */
  const settled = (): { done: string[]; rest: string } => {
    const parts = splitSentences(buffer);
    if (!parts.length) return { done: [], rest: buffer };
    /*
     * The final piece is dropped from consideration until the stream ends, because a
     * sentence that merely has not received its full stop yet is indistinguishable from
     * one that has. Emitting it early would cut a sentence in half — and inside a
     * quotation, half of what the student said.
     */
    const done = parts.slice(0, -1);
    const consumed = done.join(" ").length;
    return { done, rest: buffer.slice(consumed).trimStart() };
  };

  const take = (group: string[]): Chunk => {
    const text = group.join(" ");
    const isQuestion = group.length === 1 && isQuestionText(group[0]);
    const chunk: Chunk = {
      text,
      pauseBeforeMs: emitted === 0 ? 0 : pauseFor(text),
      isQuestion,
    };
    emitted++;
    if (emitted >= MAX_CHUNKS) over = true;
    return chunk;
  };

  const drain = (final: boolean): Chunk[] => {
    const out: Chunk[] = [];
    for (;;) {
      // The last chunk absorbs everything left rather than dropping any of it.
      if (emitted >= MAX_CHUNKS - (final ? 0 : 1)) break;

      const parts = final ? splitSentences(buffer) : settled().done;
      if (!parts.length) break;

      /*
       * A completed question goes alone, and it goes before anything queued behind it —
       * so the pause lands in front of the question, which is the whole mechanism.
       */
      const q = parts.findIndex((p) => isQuestionText(p));
      let group: string[];
      if (q === 0) group = [parts[0]];
      else if (q > 0) group = parts.slice(0, Math.min(q, SENTENCES_PER_CHUNK));
      else if (parts.length >= SENTENCES_PER_CHUNK) group = parts.slice(0, SENTENCES_PER_CHUNK);
      else if (final) group = parts.slice();
      else break;

      out.push(take(group));
      const consumed = group.join(" ").length;
      buffer = buffer.slice(buffer.indexOf(group[group.length - 1]) + group[group.length - 1].length).trimStart();
      if (!consumed) break;
    }
    return out;
  };

  return {
    push(delta: string): Chunk[] {
      buffer += delta;
      return drain(false);
    },
    end(): Chunk[] {
      if (!buffer.trim()) return [];
      const out = drain(true);
      if (buffer.trim()) {
        out.push(take([buffer.trim()]));
        buffer = "";
      }
      return out;
    },
    tooLong: () => over && buffer.trim().length > 0,
  };
}
