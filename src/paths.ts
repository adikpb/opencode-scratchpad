import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export function resolveDataDir(
  env: Record<string, string | undefined> = process.env,
): string {
  const override = env.OPENCODE_DATA_DIR;
  if (typeof override === "string" && override.length > 0) {
    return override;
  }
  return path.join(os.homedir(), ".local", "share", "opencode");
}

export function scratchpadDir(dataDir: string): string {
  return path.join(dataDir, "scratchpad");
}

export function projectKey(directory: string): string {
  const raw = path.basename(directory);
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safeSlug = slug.length > 0 ? slug : "project";
  const suffix = crypto
    .createHash("sha1")
    .update(directory)
    .digest("hex")
    .slice(0, 8);
  return `${safeSlug}-${suffix}`;
}

export function scratchpadPath(
  dataDir: string,
  directory: string,
  ext = "md",
): string {
  return path.join(scratchpadDir(dataDir), `${projectKey(directory)}.${ext}`);
}

/**
 * Reads an explicit `dataDir` plugin option, ignoring empty/whitespace values so
 * an unset option falls through to the environment/default resolution.
 */
export function optionDataDir(
  options?: Readonly<Record<string, unknown>>,
): string | undefined {
  const dir = options?.dataDir;
  return typeof dir === "string" && dir.trim().length > 0 ? dir : undefined;
}
