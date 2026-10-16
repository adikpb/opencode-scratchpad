import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Bindable command id for opening the scratchpad in the user's editor. */
export const EDITOR_COMMAND_ID = "opencode-scratchpad.editor";

/** The renderer controls the external editor session needs. */
export interface RendererControl {
  suspend(): Promise<void>;
  resume(): Promise<void>;
  requestRender(): void;
}

/** Arguments handed to the process that launches the user's editor. */
export interface EditorRunArgs {
  command: string;
  file: string;
  cwd: string | undefined;
}

export interface ExternalEditorOptions {
  value: string;
  env?: Record<string, string | undefined>;
  cwd?: string;
  renderer?: RendererControl | null;
  tmpDir?: string;
  now?: () => number;
  runEditor?: (args: EditorRunArgs) => Promise<void>;
}

/** Resolves the editor command from `$VISUAL`, falling back to `$EDITOR`. */
export function resolveEditorCommand(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const raw = env.VISUAL?.trim() || env.EDITOR?.trim();
  return raw && raw.length > 0 ? raw : undefined;
}

/** Spawns the editor on `file`, resolving once it exits cleanly. */
async function defaultRunEditor({ command, file, cwd }: EditorRunArgs): Promise<void> {
  const parts = command.split(" ");
  const bin = parts[0]!;
  const args = [...parts.slice(1), file];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: cwd && fs.existsSync(cwd) ? cwd : process.cwd(),
      stdio: ["inherit", "inherit", "inherit"],
      shell: process.platform === "win32",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `Editor exited with ${signal ? `signal ${signal}` : `code ${code}`}`,
        ),
      );
    });
  });
}

/**
 * Opens `options.value` in the user's external editor and returns the edited
 * text. The renderer is suspended while the editor runs, and the scratch file
 * is removed afterwards. Empty content resolves `undefined` so the caller can
 * leave the original text unchanged.
 */
export async function editTextExternally(
  options: ExternalEditorOptions,
): Promise<string | undefined> {
  const command = resolveEditorCommand(options.env ?? process.env);
  if (!command) {
    throw new Error("Set $VISUAL or $EDITOR to open an external editor");
  }

  const file = path.join(options.tmpDir ?? os.tmpdir(), `${(options.now ?? Date.now)()}.md`);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, options.value, "utf8");

  await options.renderer?.suspend();

  try {
    await (options.runEditor ?? defaultRunEditor)({ command, file, cwd: options.cwd });
    const content = await fs.promises.readFile(file, "utf8");
    return content.length > 0 ? content : undefined;
  } finally {
    await fs.promises.rm(file, { force: true }).catch(() => {});
    await options.renderer?.resume();
    options.renderer?.requestRender();
  }
}
