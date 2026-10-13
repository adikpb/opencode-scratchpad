import { describe, expect, test } from "bun:test";
import { COMMAND_ID, registerScratchpad } from "../src/plugin.ts";

interface Harness {
  ctx: any;
  deps: any;
  layers: any[];
  claims: any[];
  toasts: any[];
  openDialogCalls: any[];
  dialogShows: any[];
  appends: string[];
  writes: string[];
  storePaths: string[];
  pathArgs: Array<[string, string, string | undefined]>;
  sidebarRenders: string[];
  slotDisposed: { value: boolean };
}

interface HarnessConfig {
  /** Terminal width in columns; omit to model a context with no renderer. */
  terminalWidth?: number;
}

interface InMemoryStore {
  path: string;
  content: string;
  read(): string;
  write(content: string): void;
  append(line: string): string;
  exists(): boolean;
}

function createHarness(config: HarnessConfig = {}): Harness {
  const layers: any[] = [];
  const claims: any[] = [];
  const toasts: any[] = [];
  const openDialogCalls: any[] = [];
  const dialogShows: any[] = [];
  const appends: string[] = [];
  const writes: string[] = [];
  const storePaths: string[] = [];
  const pathArgs: Array<[string, string, string | undefined]> = [];
  const sidebarRenders: string[] = [];
  const slotDisposed = { value: false };

  const store: InMemoryStore = {
    path: "/unused",
    content: "",
    read() {
      return this.content;
    },
    write(content: string) {
      this.content = content;
      writes.push(content);
    },
    append(line: string) {
      appends.push(line);
      this.content = this.content.length > 0 ? `${this.content}\n${line}` : line;
      return this.content;
    },
    exists() {
      return this.content.length > 0;
    },
  };

  const ctx = {
    options: {},
    location: { directory: "/repo/project" },
    data: { location: { default: () => ({ directory: "/fallback/dir" }) } },
    renderer:
      config.terminalWidth === undefined
        ? undefined
        : { width: config.terminalWidth, height: 40 },
    keymap: {
      layer: (factory: () => any) => {
        layers.push(factory());
      },
    },
    ui: {
      toast: {
        show: (options: any) => {
          toasts.push(options);
        },
      },
      dialog: {
        show: (render: any, onClose?: any) => {
          dialogShows.push({ render, onClose });
        },
      },
      slot: (claim: any) => {
        claims.push(claim);
        return () => {
          slotDisposed.value = true;
        };
      },
    },
  };

  const deps = {
    createStore: (filePath: string) => {
      storePaths.push(filePath);
      return store;
    },
    resolveDataDir: () => "/data/opencode-scratchpad",
    scratchpadPath: (dataDir: string, directory: string, ext?: string) => {
      pathArgs.push([dataDir, directory, ext]);
      return `${dataDir}/${directory.replace(/\//g, "_")}.${ext ?? "md"}`;
    },
    renderSidebar: (sessionID: string) => {
      sidebarRenders.push(sessionID);
      return { sessionID };
    },
    openDialog: (dialogStore: unknown) => {
      openDialogCalls.push(dialogStore);
    },
  };

  return {
    ctx,
    deps,
    layers,
    claims,
    toasts,
    openDialogCalls,
    dialogShows,
    appends,
    writes,
    storePaths,
    pathArgs,
    sidebarRenders,
    slotDisposed,
  };
}

function commandOf(h: Harness): any {
  return h.layers[0].commands[0];
}

describe("registerScratchpad", () => {
  test("registers exactly one palette + slash command", () => {
    const h = createHarness();
    registerScratchpad(h.ctx, h.deps);

    expect(h.layers).toHaveLength(1);
    const commands = h.layers[0].commands;
    expect(commands).toHaveLength(1);
    expect(h.layers[0].mode).toBe("global");

    const command = commands[0];
    expect(command.id).toBe(COMMAND_ID);
    expect(command.title).toBe("Scratchpad");
    expect(command.description).toBe("Open this project's scratchpad");
    expect(command.group).toBe("Plugins");
    expect(command.palette).toBe(true);
    expect(command.slash).toEqual({ name: "scratch", arguments: true });
  });

  test("appends trimmed input and shows a success toast", async () => {
    const h = createHarness();
    registerScratchpad(h.ctx, h.deps);

    await commandOf(h).run("hello");

    expect(h.appends).toEqual(["hello"]);
    expect(h.toasts).toHaveLength(1);
    expect(h.toasts[0]).toMatchObject({
      message: "Saved to scratchpad",
      variant: "success",
    });
    expect(h.openDialogCalls).toEqual([]);
  });

  test("trims whitespace around appended input", async () => {
    const h = createHarness();
    registerScratchpad(h.ctx, h.deps);

    await commandOf(h).run("  spaced  ");

    expect(h.appends).toEqual(["spaced"]);
  });

  test("always opens the dialog with no argument, at any width", async () => {
    for (const width of [undefined, 200, 120, 81, 80, 40, 0]) {
      const h = createHarness(
        width === undefined ? {} : { terminalWidth: width },
      );
      registerScratchpad(h.ctx, h.deps);

      const command = commandOf(h);
      await command.run();
      await command.run("");
      await command.run("   ");

      expect(h.openDialogCalls).toHaveLength(3);
      expect(h.appends).toEqual([]);
      expect(h.toasts).toEqual([]);
    }
  });

  test("appending text never opens the dialog", async () => {
    const h = createHarness({ terminalWidth: 40 });
    registerScratchpad(h.ctx, h.deps);

    await commandOf(h).run("a note");

    expect(h.openDialogCalls).toEqual([]);
    expect(h.toasts).toHaveLength(1);
  });

  test("claims the sidebar.content slot and renders via renderSidebar", () => {
    const h = createHarness();
    registerScratchpad(h.ctx, h.deps);

    expect(h.claims).toHaveLength(1);
    const claim = h.claims[0];
    expect(claim.append).toBe("sidebar.content");

    expect(claim.render({ sessionID: "ses_1" })).toEqual({ sessionID: "ses_1" });
    expect(h.sidebarRenders).toEqual(["ses_1"]);
  });

  test("resolves the store from the active location directory", () => {
    const h = createHarness();
    registerScratchpad(h.ctx, h.deps);

    expect(h.storePaths).toHaveLength(1);
    expect(h.storePaths[0]).toBe("/data/opencode-scratchpad/_repo_project.md");
  });

  test("falls back to the default location directory", () => {
    const h = createHarness();
    h.ctx.location = undefined;
    registerScratchpad(h.ctx, h.deps);

    expect(h.pathArgs).toHaveLength(1);
    expect(h.pathArgs[0][1]).toBe("/fallback/dir");
  });

  test("honours the configured extension from options", () => {
    const h = createHarness();
    h.ctx.options = { ext: "txt" };
    registerScratchpad(h.ctx, h.deps);

    expect(h.pathArgs[0][2]).toBe("txt");
    expect(h.storePaths[0].endsWith(".txt")).toBe(true);
  });

  test("prefers the dataDir option over the injected resolver", () => {
    const h = createHarness();
    h.ctx.options = { dataDir: "/custom/data" };
    registerScratchpad(h.ctx, h.deps);

    expect(h.pathArgs[0][0]).toBe("/custom/data");
    expect(h.storePaths[0].startsWith("/custom/data/")).toBe(true);
  });

  test("cleanup disposes the slot claim", () => {
    const h = createHarness();
    const cleanup = registerScratchpad(h.ctx, h.deps);

    expect(h.slotDisposed.value).toBe(false);
    cleanup();
    expect(h.slotDisposed.value).toBe(true);
  });
});
