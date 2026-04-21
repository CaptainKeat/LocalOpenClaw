---
summary: "Persist agent learnings as linked Markdown notes in an Obsidian vault"
read_when:
  - You want the agent to keep a durable notebook of decisions and insights
  - You already use Obsidian and want the agent's notes alongside yours
  - You need to search, recall, or summarize past agent learnings
title: "Obsidian Knowledge Graph"
---

# Obsidian Knowledge Graph

The `obsidian-agi` bundled plugin gives the agent a long-term notebook backed
by a folder inside your Obsidian vault. Every entry is a plain Markdown file
with YAML frontmatter and Obsidian-flavoured `[[wiki-links]]` to related
past entries. You can open the folder in Obsidian and the backlinks graph
lights up with no extra setup.

The plugin exposes four tools:

- `knowledge_log` — write a new entry
- `knowledge_search` — keyword-search existing entries
- `knowledge_recall` — read a specific entry with its outgoing links and backlinks
- `knowledge_summary` — overview: total notes, recent activity, category/agent breakdown

It does **not** auto-log every tool call. The agent has to decide something
is worth remembering and call `knowledge_log` explicitly. This is a deliberate
choice: the alternative is noise, and the plugin SDK does not currently expose
an after-tool-call hook.

## Configure the vault path

Either set the env var or the plugin config. The plugin config takes
precedence.

```bash
export OBSIDIAN_VAULT=/Users/you/Documents/MyVault
```

or

```json5
{
  plugins: {
    entries: {
      "obsidian-agi": {
        enabled: true,
        config: {
          vaultPath: "/Users/you/Documents/MyVault",
          knowledgeFolder: "OpenClaw",
        },
      },
    },
  },
}
```

All notes land under `<vaultPath>/<knowledgeFolder>/`. Defaults to
`OpenClaw`. Pick any folder name you like.

## What a note looks like

```markdown
---
title: "Postgres connection pooling"
date: 2026-04-21T15:10:30.112Z
agent: main
category: learning
tags: ["learning", "postgres", "pgbouncer"]
---

## Postgres connection pooling

Discovered that PgBouncer in transaction mode breaks our prepared statements.
Need to switch to session mode or disable prepared statements in the client.

### Related Knowledge
- [[OpenClaw/2026-04-20-pgbouncer-session-mode-tradeoffs|pgbouncer-session-mode-tradeoffs]]

---
#learning #postgres #pgbouncer
```

Open that in Obsidian and the `[[wiki-links]]` render as real links. The
backlinks panel shows every note that points back.

## Tool parameters

### knowledge_log

| Parameter   | Description                                                                        |
| ----------- | ---------------------------------------------------------------------------------- |
| `title`     | Short title for the entry (required)                                               |
| `content`   | Body text, Markdown allowed (required)                                             |
| `category`  | Frontmatter category. Defaults to `learning`. Common: decision, insight, pattern, error |
| `tags`      | Array of tag strings                                                               |
| `agent`     | Which agent is logging. Defaults to `manual`                                       |

### knowledge_search

| Parameter    | Description                                                                    |
| ------------ | ------------------------------------------------------------------------------ |
| `query`      | Whitespace-separated keywords (required)                                       |
| `category`   | Optional filter by frontmatter category                                        |
| `maxResults` | Optional cap (1-50, default 10)                                                |

### knowledge_recall

| Parameter | Description                                                                     |
| --------- | ------------------------------------------------------------------------------- |
| `note`    | Slug, path relative to vault, or path with `.md` extension (required)            |

Returns `{ path, content, links, backlinks }` — the full note body, every
outgoing `[[wiki-link]]`, and every note in the knowledge folder that links
back to this one.

### knowledge_summary

| Parameter | Description                                              |
| --------- | -------------------------------------------------------- |
| `days`    | Count notes modified within this many days as "recent" (default 7) |

Returns `{ total, recentCount, days, categories, agents, mostConnected }`.
`mostConnected` is the top 5 notes by outgoing-link count.

## Platform notes

- Works on macOS, Linux, Windows. The plugin only touches Markdown files in
  your vault — it does not talk to Obsidian itself.
- You do not need Obsidian installed for the tools to work. Any folder of
  Markdown notes works. Obsidian is just the natural renderer for wiki-links.
- The vault path is outside the gateway's normal file sandbox by design: it
  is a user-chosen output root. Treat the folder like any other agent output
  directory.

## Limitations

- No automatic logging. Use `knowledge_log` deliberately.
- Keyword search is substring-based, not semantic. If you need vector search
  over notes, pair this plugin with `memory-lancedb` or similar.
- The backlinks scan brute-forces every file in the knowledge folder on each
  recall. For vaults with thousands of entries this is fine; beyond that
  consider a dedicated index.
