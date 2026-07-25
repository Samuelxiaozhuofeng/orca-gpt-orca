/**
 * Extract a user-facing final answer from raw Local CLI stream output.
 *
 * Limitation (by design, conservative):
 * The bridge stream is unstructured raw text with no reliable semantic
 * "final answer" delimiter. When none of the known markers appear, we return
 * the cleaned full output and set `usedMarker: false`. Callers must not
 * pretend perfect separation in that case.
 */

export type ExtractLocalCliFinalResult = {
  /** Text suitable for writing into a note block. */
  text: string;
  /** True only when an explicit final-result marker was found. */
  usedMarker: boolean;
};

/** CSI / OSC / common ANSI escape sequences. */
const ANSI_RE =
  /(?:\u001B\[[\d;?]*[ -/]*[@-~]|\u001B\][^\u0007]*(?:\u0007|\u001B\\)|\u001B[@-Z\\-_])/g;

/**
 * Known markers that agents sometimes emit before the final answer.
 * Matched as a whole line prefix (case-sensitive where listed); first hit
 * from the *last* matching marker line wins (prefer the final occurrence).
 */
const FINAL_MARKERS: RegExp[] = [
  /^\s*FINAL:\s*/i,
  /^\s*Final answer:\s*/i,
  /^\s*Final Answer:\s*/i,
  /^\s*结果:\s*/,
  /^\s*最终结果:\s*/,
  /^\s*---\s*RESULT\s*---\s*$/i,
  /^\s*##\s*Final\b.*$/i,
];

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

/**
 * Remove lines that are clearly stderr channel prefixes from the bridge.
 * Does not invent structure beyond the `[stderr]` convention already used
 * in localCliRunner.
 */
export function dropStderrPrefixedLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*\[stderr\]/i.test(line))
    .join("\n");
}

export function extractLocalCliFinalResult(
  rawOutput: string,
): ExtractLocalCliFinalResult {
  const withoutAnsi = stripAnsi(rawOutput ?? "");
  const cleaned = dropStderrPrefixedLines(withoutAnsi).replace(/\s+$/, "");

  if (!cleaned.trim()) {
    return { text: "", usedMarker: false };
  }

  const lines = cleaned.split(/\r?\n/);

  // Scan from the end so the last explicit marker wins.
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    for (const marker of FINAL_MARKERS) {
      const match = line.match(marker);
      if (!match) continue;

      // Marker alone on the line → body is everything after that line.
      // Marker with inline remainder → that remainder is the first body line.
      const inlineRest = line.slice(match[0].length);
      const isWholeLineMarker =
        /^\s*---\s*RESULT\s*---\s*$/i.test(line) ||
        /^\s*##\s*Final\b.*$/i.test(line) ||
        !inlineRest.trim();

      const bodyLines = isWholeLineMarker
        ? lines.slice(i + 1)
        : [inlineRest, ...lines.slice(i + 1)];

      const body = bodyLines.join("\n").trim();
      if (body) {
        return { text: body, usedMarker: true };
      }
      // Marker found but empty body — keep searching earlier markers.
    }
  }

  // Fallback: no delimiter. Surface the cleaned full stream as best-effort.
  return { text: cleaned.trim(), usedMarker: false };
}

/**
 * Derive a short status line for the inline status block from stream text.
 * Prefers the last non-empty, non-stderr line.
 */
export function deriveLocalCliStatusLine(
  rawOutput: string,
  maxLen = 140,
): string {
  const cleaned = dropStderrPrefixedLines(stripAnsi(rawOutput));
  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return "Waiting for output…";

  const last = lines[lines.length - 1];
  if (last.length <= maxLen) return last;
  return `${last.slice(0, maxLen - 1)}…`;
}
