import { createSignal, onCleanup, Show } from "solid-js";
import {
  createTextAttributes,
  type KeyEvent,
  type TextareaRenderable,
} from "@opentui/core";
import { Plugin } from "@opencode/plugin/tui";
import type { Context, PanelInput } from "@opencode/plugin/tui/context";
import { PANEL_NAME, PLUGIN_ID, registerScratchpad } from "./plugin.ts";
import { createStore, type Scratchpad } from "./store.ts";
import { optionDataDir, resolveDataDir, scratchpadPath } from "./paths.ts";

/** Quiet secondary text: the terminal's own dim attribute, so we stay on-theme. */
const DIM = createTextAttributes({ dim: true });

/** Idle time before an edit is flushed to disk. */
const SAVE_DEBOUNCE_MS = 500;

function safeRead(store: Scratchpad): string {
  try {
    return store.read();
  } catch {
    return "";
  }
}

/**
 * The session-panel contribution. Any panel whose name is not ours renders an
 * empty box so other plugins' panels are left untouched.
 */
export function ScratchpadPanel(props: { ctx: Context; panel: PanelInput }) {
  return (
    <Show when={props.panel.name === PANEL_NAME} fallback={<box />}>
      <ScratchpadEditor ctx={props.ctx} panel={props.panel} />
    </Show>
  );
}

function ScratchpadEditor(props: { ctx: Context; panel: PanelInput }) {
  const directory =
    props.ctx.location?.directory ?? props.ctx.data.location.default().directory;
  const filePath = scratchpadPath(
    optionDataDir(props.ctx.options) ?? resolveDataDir(),
    directory,
    props.ctx.options?.ext,
  );
  const store = createStore(filePath);

  // Seed the buffer from disk once. A missing file simply reads as "".
  const initial = safeRead(store);
  const [value, setValue] = createSignal(initial);
  const [dirty, setDirty] = createSignal(false);

  let textarea: TextareaRenderable | undefined;
  let lastSaved = initial;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const readCurrent = () => {
    try {
      return textarea?.plainText ?? value();
    } catch {
      return value();
    }
  };

  const persist = (announce: boolean) => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    const text = readCurrent();
    try {
      store.write(text);
    } catch {
      props.ctx.ui.toast.show({
        message: "Could not save scratchpad",
        variant: "error",
      });
      return;
    }
    lastSaved = text;
    setValue(text);
    setDirty(false);
    if (announce) {
      props.ctx.ui.toast.show({ message: "Scratchpad saved", variant: "success" });
    }
  };

  const schedule = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      persist(false);
    }, SAVE_DEBOUNCE_MS);
  };

  const handleChange = () => {
    const text = readCurrent();
    setValue(text);
    const changed = text !== lastSaved;
    setDirty(changed);
    if (changed) schedule();
  };

  const handleKeyDown = (event: KeyEvent) => {
    if (event.name === "escape") {
      event.preventDefault();
      if (dirty()) persist(false);
      props.panel.close();
      return;
    }
    if (event.ctrl && !event.meta && !event.shift && event.name === "s") {
      event.preventDefault();
      persist(true);
    }
  };

  // Flush any pending edit when the panel unmounts.
  onCleanup(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (dirty()) {
      try {
        store.write(readCurrent());
      } catch {
        // Unmount is not the place to surface errors.
      }
    }
  });

  return (
    <box flexDirection="column" flexGrow={1} width="100%" height="100%" paddingX={1} gap={1}>
      <box flexDirection="column">
        <box flexDirection="row" justifyContent="space-between" gap={2}>
          <text>
            <b>Scratchpad</b>
          </text>
          <text attributes={DIM} wrapMode="none" truncate>
            {props.ctx.ui.format.path(directory)}
          </text>
        </box>
        <text attributes={DIM} wrapMode="none" truncate>
          <i>{filePath}</i>
        </text>
      </box>

      <box flexGrow={1} border borderStyle="rounded" paddingX={1}>
        <textarea
          ref={(node: TextareaRenderable) => {
            textarea = node;
          }}
          flexGrow={1}
          focused={props.panel.focused}
          initialValue={initial}
          placeholder="Type your notes…"
          wrapMode="word"
          onContentChange={handleChange}
          onKeyDown={handleKeyDown}
        />
      </box>

      <box flexDirection="row" justifyContent="space-between" gap={2}>
        <text attributes={DIM}>Ctrl+S save · Esc close</text>
        <Show when={dirty()} fallback={<text attributes={DIM}>saved</text>}>
          <text>● unsaved</text>
        </Show>
      </box>
    </box>
  );
}

export default Plugin.define({
  id: PLUGIN_ID,
  setup(ctx) {
    return registerScratchpad(ctx, {
      createStore,
      resolveDataDir,
      scratchpadPath,
      renderPanel: (input) => <ScratchpadPanel ctx={ctx} panel={input} />,
    });
  },
});
