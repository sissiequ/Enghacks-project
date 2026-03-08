/**
 * Input:
 * - levelStr: string|null
 * Output:
 * - Array<string>: normalized lowercase level tags
 */
function getLevelTokens(levelStr) {
  if (!levelStr) return [];
  return levelStr.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
}

globalThis.getLevelTokens = getLevelTokens;
