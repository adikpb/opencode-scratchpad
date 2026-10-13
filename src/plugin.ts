import type { Context, PanelInput } from "@opencode/plugin/tui/context";
import { optionDataDir } from "./paths.ts";
import type { Scratchpad } from "./store.ts";

/** Stable plugin identity, shared by the TUI and server entries. */
export const PLUGIN_ID = "opencode-scratchpad";

/** Name of the session panel this plugin owns. */
export const PANEL_NAME = "opencode-scratchpad";

/** Stable command identifier used by the palette, slash completion, and keyconfig. */
export const COMMAND_ID = "opencode-scratchpad.open";

/**
 * Everything `registerScratchpad` needs from the outside world. Injection keeps
 * this module free of JSX, filesystem access, and env reads so it can be tested
 * as plain logic.
 */
export interface ScratchpadDeps {
  createStore: (filePath: string) => Scratchpad;
  resolveDataDir: (env?: Record<string, string | undefined>) => string;
  scratchpadPath: (dataDir: string, directory: string, ext?: string) => string;
  /** JSX element factory injected by tui.tsx. */
  renderPanel: (panel: PanelInput) => any;
}

/**
 * Wires the scratchpad into a live TUI context: a palette/slash command that
 * appends to or opens the pad, and a claim on the session.panel slot.
 *
 * Returns a cleanup that releases the slot claim. The keymap layer is owned by
 * the plugin lifecycle and disposes with it.
 */
export function registerScratchpad(ctx: Context, deps: ScratchpadDeps): () => void {
  const directory = ctx.location?.directory ?? ctx.data.location.default().directory;
  const dataDir = optionDataDir(ctx.options) ?? deps.resolveDataDir();
  const store = deps.createStore(
    deps.scratchpadPath(dataDir, directory, ctx.options?.ext),
  );

  ctx.keymap.layer(() => ({
    mode: "global",
    commands: [
      {
        id: COMMAND_ID,
        title: "Scratchpad",
        description: "Open this project's scratchpad",
        group: "Plugins",
        palette: true,
        slash: { name: "scratch", arguments: true },
        run: async (input?: string) => {
          const text = input?.trim() ?? "";
          if (text) {
            store.append(text);
            ctx.ui.toast.show({ message: "Saved to scratchpad", variant: "success" });
            return;
          }
          ctx.ui.panel.open(PANEL_NAME);
        },
      },
    ],
  }));

  const unclaim = ctx.ui.slot({
    append: "session.panel",
    render: (input) => deps.renderPanel(input),
  });

  return () => {
    unclaim();
  };
}
