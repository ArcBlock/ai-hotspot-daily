import { parse as parseYaml } from "yaml";
import { resolve, dirname } from "path";
import type { Config, SourceOutput } from "./types";

/**
 * Find the skill root directory by walking up from scripts/ to find sources/ai.yaml.
 * @param startDir - Starting directory (defaults to the caller's __dirname equivalent)
 */
export function findSkillRoot(startDir?: string): string {
  let dir = startDir ? dirname(startDir) : dirname(import.meta.dir);
  // Walk up until we find sources/ai.yaml (skill root)
  for (let i = 0; i < 10; i++) {
    try {
      if (Bun.file(resolve(dir, "sources/ai.yaml")).size) return dir;
    } catch {}
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: assume startDir is inside scripts/ → go 1 level up
  return resolve(startDir || import.meta.dir, "..");
}

/**
 * Find the project root directory by walking up to find .git/HEAD.
 * @param startDir - Starting directory (defaults to the caller's __dirname equivalent)
 */
export function findProjectRoot(startDir?: string): string {
  let dir = startDir ? dirname(startDir) : dirname(import.meta.dir);
  // Walk up until we find .git directory (project root)
  for (let i = 0; i < 10; i++) {
    try {
      if (Bun.file(resolve(dir, ".git/HEAD")).size) return dir;
    } catch {}
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: skill root's grandparent (.claude/skills/hotspot-daily → project root)
  return resolve(findSkillRoot(startDir), "../../..");
}

export function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

export function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        result[key] = next;
        i++;
      } else {
        result[key] = "true";
      }
    }
  }
  return result;
}

export async function loadConfig(configPath: string): Promise<Config> {
  const content = await Bun.file(configPath).text();
  return parseYaml(content) as Config;
}

export async function writeOutput(
  output: SourceOutput,
  outputPath: string
): Promise<void> {
  await Bun.write(outputPath, JSON.stringify(output, null, 2));
}

export function createSourceOutput(
  source: string,
  items: SourceOutput["items"],
  errors?: string[]
): SourceOutput {
  return {
    source,
    fetchedAt: new Date().toISOString(),
    items,
    errors: errors?.length ? errors : undefined,
  };
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; HotspotDaily/1.0)",
        ...options.headers,
      },
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}
