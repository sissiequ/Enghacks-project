/**
 * Input:
 * - text: any value to be converted into a trimmed string
 * - maxLen: number, max allowed length
 * Output:
 * - string: trimmed text, truncated with marker when it exceeds maxLen
 */
function cap(text, maxLen) {
  const value = (text || "").toString().trim();
  return value.length > maxLen ? `${value.slice(0, maxLen)}\n...[TRUNCATED]` : value;
}

globalThis.cap = cap;
