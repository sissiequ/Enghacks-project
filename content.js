/**
 * Input:
 * - none
 * Output:
 * - none (invokes content helper bootstrap exactly once)
 */
if (!globalThis.__coopsyncContentBootstrapped) {
  globalThis.__coopsyncContentBootstrapped = true;
  if (typeof bootstrapContentScript === "function") {
    // Uses helper function: bootstrapContentScript (from content_helpers/bootstrapContent.js)
    bootstrapContentScript();
  }
}
