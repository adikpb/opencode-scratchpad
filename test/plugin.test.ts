import { describe, expect, test } from "bun:test";
import { COMMAND_ID, PANEL_NAME, registerScratchpad } from "../src/plugin.ts";

interface Harness {
  ctx: any;
  deps: any;
  layers: any[];
  claims: any[];
  toasts: any[];
  opens: string[];
  appends: string[];
  writes: string[];
  storePaths: string[];
  pathArgs: Array<[string, string, string | undefined]>;
  slotDisposed: { value: boolean };
}

interface InMemoryStore {
  path: string;
  content: string;
  read(): string;
  write(content: string): void;
  append(line: string): string;
  exists(): boolean;
}

function createHarness(): Harness {
  const layers: any[] = [];
  const claims: any[] = [];
  const toasts: any[] = [];
  const opens: string[] = [];
  const appends: string[] = [];
  const writes: string[] = [];
  const storePaths: string[] = [];
  const pathArgs: Array<[string, string, string | undefined]> = [];
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
      panel: {
        open: (name: string) => {
          opens.push(name);
          return true;
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
    renderPanel: (panel: unknown) => panel,
  };

  return {
    ctx,
    deps,
    layers,
    claims,
    toasts,
    opens,
    appends,
    writes,
    storePaths,
    pathArgs,
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
    expect(h.opens).toEqual([]);
  });

  test("trims whitespace around appended input", async () => {
    const h = createHarness();
    registerScratchpad(h.ctx, h.deps);

    await commandOf(h).run("  spaced  ");

    expect(h.appends).toEqual(["spaced"]);
  });

  test("opens the panel when input is empty", async () => {
    const h = createHarness();
    registerScratchpad(h.ctx, h.deps);

    const command = commandOf(h);
    await command.run();
    await command.run("");
    await command.run("   ");

    expect(h.opens).toEqual([PANEL_NAME, PANEL_NAME, PANEL_NAME]);
    expect(h.appends).toEqual([]);
    expect(h.toasts).toEqual([]);
  });

  test("claims the session.panel slot and renders via renderPanel", () => {
    const h = createHarness();
    registerScratchpad(h.ctx, h.deps);

    expect(h.claims).toHaveLength(1);
    const claim = h.claims[0];
    expect(claim.append).toBe("session.panel");

    const input = { name: PANEL_NAME, sessionID: "ses_1" };
    expect(claim.render(input)).toBe(input);
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
