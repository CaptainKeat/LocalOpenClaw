import { definePluginEntry, type AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { createHardwareInfoTool } from "./src/hardware-info-tool.js";

export default definePluginEntry({
  id: "hardware-info",
  name: "Hardware Info Plugin",
  description:
    "Detect CPU, RAM, and GPU resources and surface local-model recommendations to the agent.",
  register(api) {
    api.registerTool(createHardwareInfoTool(api) as AnyAgentTool);
  },
});
