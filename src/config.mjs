import fs from "node:fs";
import path from "node:path";
import { ROOT_DIR } from "./browser.mjs";

/**
 * Local config (copy from config.example.json). Never commit real values.
 * @returns {{ teamId?: string, workspaceName?: string }}
 */
export function loadConfig() {
  const file = path.join(ROOT_DIR, "config.json");
  if (!fs.existsSync(file)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      teamId:
        typeof raw.teamId === "string"
          ? raw.teamId.trim()
          : typeof raw.team_id === "string"
            ? raw.team_id.trim()
            : undefined,
      workspaceName:
        typeof raw.workspaceName === "string"
          ? raw.workspaceName.trim()
          : typeof raw.workspace_name === "string"
            ? raw.workspace_name.trim()
            : typeof raw.space === "string"
              ? raw.space.trim()
              : undefined,
    };
  } catch {
    console.warn("Warning: config.json is not valid JSON — ignoring.");
    return {};
  }
}

/**
 * Resolve team id: CLI → env → config.json
 * @param {Record<string, string | boolean>} args
 * @param {{ teamId?: string }} config
 */
export function resolveTeamId(args, config) {
  const fromCli =
    (typeof args["team-id"] === "string" && args["team-id"].trim()) ||
    (typeof args.teamId === "string" && args.teamId.trim()) ||
    "";
  const fromEnv = (process.env.CLICKUP_TEAM_ID || "").trim();
  const fromConfig = (config.teamId || "").trim();
  return fromCli || fromEnv || fromConfig;
}

/**
 * Resolve workspace display name (optional soft-check): CLI → env → config
 * @param {Record<string, string | boolean>} args
 * @param {{ workspaceName?: string }} config
 */
export function resolveWorkspaceName(args, config) {
  const fromCli =
    (typeof args.workspace === "string" && args.workspace.trim()) ||
    (typeof args.space === "string" && args.space.trim()) ||
    "";
  const fromEnv = (process.env.CLICKUP_WORKSPACE_NAME || "").trim();
  const fromConfig = (config.workspaceName || "").trim();
  return fromCli || fromEnv || fromConfig;
}
