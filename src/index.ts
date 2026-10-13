import { Plugin } from "@opencode/plugin";
import { PLUGIN_ID } from "./plugin.ts";

/**
 * Server-side entry. The scratchpad is a TUI-only feature, so this is a no-op
 * that lets the package resolve cleanly in server plugin contexts too.
 */
export default Plugin.define({
  id: PLUGIN_ID,
  setup() {},
});
