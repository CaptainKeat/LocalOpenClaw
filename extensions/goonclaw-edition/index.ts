import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createEditionCommand } from "./src/edition-command.js";
import { GOONCLAW_EDITION_VERSION } from "./src/edition-info.js";

type PluginCfg = {
  quiet?: boolean;
};

export default definePluginEntry({
  id: "goonclaw-edition",
  name: "GoonClaw Edition",
  description:
    "Meta-plugin marking this build as the GoonClaw edition. Registers the `goonclaw` status command and (optionally) logs a startup line. See docs/goonclaw-personas.md and the bundled hardware-info / obsidian-agi plugins.",
  register(api) {
    api.registerCommand(createEditionCommand());
    const cfg = (api.pluginConfig ?? {}) as PluginCfg;
    if (cfg.quiet !== true) {
      // Intentionally console.log, not a structured logger: this is a one-time
      // "which edition am I running?" breadcrumb, not a runtime event.
      console.log(
        `  [goonclaw-edition] v${GOONCLAW_EDITION_VERSION} — run \`/goonclaw\` in chat for bundled-plugin docs.`,
      );
    }
  },
});
