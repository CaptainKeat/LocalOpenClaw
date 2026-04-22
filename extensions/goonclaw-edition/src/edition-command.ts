import type {
  OpenClawPluginCommandDefinition,
  PluginCommandContext,
} from "openclaw/plugin-sdk/plugin-entry";
import { resolveStateDir } from "openclaw/plugin-sdk/state-paths";
import { renderEditionText } from "./edition-info.js";
import { applyPreset, summarizePresetResult } from "./preset.js";

export function createEditionCommand(): OpenClawPluginCommandDefinition {
  return {
    name: "goonclaw",
    description:
      "GoonClaw edition controls. `/goonclaw` shows info. `/goonclaw quiet` disables noisy bootstrap/memory-flush hooks. `/goonclaw loud` restores them.",
    acceptsArgs: true,
    handler: async (ctx: PluginCommandContext) => {
      const sub = (ctx.args ?? "").trim().toLowerCase();
      if (sub === "quiet" || sub === "loud") {
        const stateDir = resolveStateDir(process.env);
        const result = applyPreset(sub, { stateDir });
        return { text: summarizePresetResult(result) };
      }
      if (sub === "" || sub === "info" || sub === "help") {
        return { text: renderEditionText() };
      }
      return {
        text: `Unknown subcommand: \`${sub}\`. Try \`/goonclaw\`, \`/goonclaw quiet\`, or \`/goonclaw loud\`.`,
      };
    },
  };
}
