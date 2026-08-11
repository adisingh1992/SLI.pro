import SummaryList from "@/components/conversation-summary/summary-list";

/**
 * The generated session summaries.
 *
 * This is a thin wrapper on purpose. `SummaryList` is the same component the
 * student sees on their own dashboard, with `isAdmin` switching the endpoints
 * to the admin equivalents. Reimplementing it here for the admin panel would
 * mean two renderers for the same artifact, which drift — and the drift shows
 * up as an advisor and a student describing the same summary differently in a
 * meeting.
 */
export function SummaryPanel({ userId }: { userId: number }) {
  return <SummaryList userId={userId} isAdmin />;
}
