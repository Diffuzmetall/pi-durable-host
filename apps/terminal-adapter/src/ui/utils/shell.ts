/** Pure display sanitization retained from Pi; no shell discovery or process execution in this slice. */
export function sanitizeBinaryOutput(str: string): string {
  // All removed characters are single UTF-16 code units, so surrogate pairs are never split.
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFF9-\uFFFB]/g, "");
}
