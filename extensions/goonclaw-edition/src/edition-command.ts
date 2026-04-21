import type {
  OpenClawPluginCommandDefinition,
  PluginCommandContext,
} from "openclaw/plugin-sdk/plugin-entry";
import { renderEditionText } from "./edition-info.js";

export function createEditionCommand(): OpenClawPluginCommandDefinition {
  return {
    name: "goonclaw",
    description: "Show GoonClaw edition info: bundled plugins, docs, personas.",
    acceptsArgs: false,
    handler: async (_ctx: PluginCommandContext) => ({
      text: renderEditionText(),
    }),
  };
}
