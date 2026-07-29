/**
 * Parsing of JSON returned by an LLM.
 *
 * Models wrap JSON in ``` fences, prepend "Here's the analysis:", or add a
 * trailing note, more or less at random. A bare JSON.parse on that output
 * throws — and when the throw lands inside a broad try/catch it silently turns
 * into "nothing happened", which is exactly how the Foundation Session
 * completion bug hid for as long as it did.
 *
 * So: strip fences, try, then fall back to the outermost brace-delimited span.
 * If it still fails, throw with the actual text included, because the response
 * body is the only thing that makes these diagnosable.
 */
export function parseJsonResponse<T = any>(raw: string, label = "response"): T {
  let text = (raw ?? "").trim();

  text = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(text) as T;
  } catch {
    // Prose before or after the object is common; take the widest {...} span.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error(
        `${label} was not JSON. First 200 chars: ${text.slice(0, 200)}`,
      );
    }
    return JSON.parse(match[0]) as T;
  }
}
