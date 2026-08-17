/**
 * Whether a cycle's methodology may change right now — pure, no imports.
 *
 * ── WHY THIS MOVED OUT OF heuristics-routes.ts ───────────────────────────
 * It was a private function in the file that publishes heuristic sequences, and
 * it is not specific to them. The rule is about the COHORT: methodology changes
 * belong between cohorts, not during them, because changing it under students who
 * are partway through makes their experience a mixture and cohort-to-cohort
 * comparison meaningless (spec §2).
 *
 * A cycle's voice profile is the same kind of change by the same argument — it is
 * the opening of every reply Wing composes — so the voice publication path needs
 * this same gate. Copying it would have produced two gates that drift, and the
 * first divergence would be invisible: both would still return a boolean.
 */

export type EvaluationWindow = { open: boolean; reason: string };

export function evaluationWindowState(cycle: {
  status: string;
  evaluationWindowStart: string | null;
  evaluationWindowEnd: string | null;
}): EvaluationWindow {
  if (cycle.status !== "active") {
    return { open: true, reason: "cycle is not active, so no student is mid-cycle" };
  }
  if (!cycle.evaluationWindowStart || !cycle.evaluationWindowEnd) {
    return { open: false, reason: "cycle has no evaluation window defined" };
  }

  const today = new Date().toISOString().slice(0, 10);
  const open =
    today >= cycle.evaluationWindowStart && today <= cycle.evaluationWindowEnd;

  return {
    open,
    reason: open
      ? `inside the evaluation window (${cycle.evaluationWindowStart} to ${cycle.evaluationWindowEnd})`
      : `outside the evaluation window (${cycle.evaluationWindowStart} to ${cycle.evaluationWindowEnd})`,
  };
}
