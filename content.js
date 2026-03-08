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
    try {
      bootstrapContentScript();
    } catch (error) {
      console.error("CoopSync content bootstrap failed:", error);
    }
  }
}
