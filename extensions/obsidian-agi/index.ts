import { definePluginEntry, type AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { createAutoLogHandler } from "./src/autolog.js";
import { createKnowledgeExportTool } from "./src/tools/knowledge-export.js";
import { createKnowledgeLogTool } from "./src/tools/knowledge-log.js";
import { createKnowledgeRecallTool } from "./src/tools/knowledge-recall.js";
import { createKnowledgeSearchTool } from "./src/tools/knowledge-search.js";
import { createKnowledgeSummaryTool } from "./src/tools/knowledge-summary.js";

export default definePluginEntry({
  id: "obsidian-agi",
  name: "Obsidian Knowledge Graph",
  description:
    "Persist agent learnings and decisions as Markdown notes in an Obsidian vault with keyword-linked backlinks. Exposes knowledge_log / knowledge_search / knowledge_recall / knowledge_summary / knowledge_export tools and an opt-in tool:executed auto-logger.",
  register(api) {
    api.registerTool(createKnowledgeLogTool(api) as AnyAgentTool);
    api.registerTool(createKnowledgeSearchTool(api) as AnyAgentTool);
    api.registerTool(createKnowledgeRecallTool(api) as AnyAgentTool);
    api.registerTool(createKnowledgeSummaryTool(api) as AnyAgentTool);
    api.registerTool(createKnowledgeExportTool(api) as AnyAgentTool);

    // Opt-in auto-logger: listens to tool:executed and writes a knowledge
    // note per significant tool call. Dormant unless pluginConfig.autoLog
    // is true. Reads config through a getter so users can toggle it without
    // restarting the gateway.
    api.registerHook(
      "tool:executed",
      createAutoLogHandler({ getPluginConfig: () => api.pluginConfig }),
    );
  },
});
