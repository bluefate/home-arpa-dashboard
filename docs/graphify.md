# Graphify

Local knowledge graph for HomeArpaDashboard. Agents use it before exploring or changing code. Output lives in `graphify-out/` (gitignored — regenerate on each machine).

This setup follows the BluefateLabs Graphify guide: https://github.com/BluefateLabs/bluefatelabs/blob/main/docs/graphify.md

## Install

From the repo root:

```bash
cd /path/to/home-arpa-dashboard
```

Install the CLI if you do not already have it, then wire up agent platforms:

```bash
graphify cursor install
graphify codex install
graphify devin install
graphify hook install
```

That copies the Graphify skill/rules into each tool (Cursor rule: `.cursor/rules/graphify.mdc`).

## Build the graph

Code-only build (no LLM corpus pass):

```bash
graphify . --code-only
```

If `graphify-out/graph.html` is missing or the HTML step fails:

```bash
graphify cluster-only .
graphify . --code-only
```

After code edits, refresh with:

```bash
graphify update .
```

## Preview

```bash
open graphify-out/graph.html
```

Or open `graphify-out/graph.html` in a browser.

## Agent prompt

When starting work in Cursor, Codex, Devin, or similar, include something like:

> Use the existing Graphify knowledge graph to understand this project before making changes.

Prefer `graphify query`, `graphify path`, and `graphify explain` over blind grep/read. See `.cursor/rules/graphify.mdc`.

Useful HomeArpaDashboard questions:

- What path does a `POST /api/services` request take from validation to persistence?
- Which modules can update Pi-hole or Caddy state?
- Which files determine whether integrations are enabled in `/api/health`?
- What public UI files depend on the shape of the service API response?
- Which docs mention API keys, `.env`, or private LAN behavior?

## Ignore files

Add this to the repo root `.gitignore` (already present in this project):

```gitignore
# Graphify knowledge graph (regenerate locally; see docs/graphify.md)
graphify-out/
```

That covers the whole output tree, including:

| Path under `graphify-out/` | What it is |
|----------------------------|------------|
| `graph.json` | Graph data used by `query` / `path` / `explain` |
| `graph.html` | Interactive preview |
| `GRAPH_REPORT.md` | Architecture report |
| `manifest.json` | Build manifest |
| `.graphify_root`, `.graphify_analysis.json`, `.graphify_labels.json`, `.graphify_labels.json.sig` | Graphify metadata |
| `cache/` | AST / index cache (`cache/ast/`, etc.) |
| Dated folders (e.g. `2026-10-01/`) | Run snapshots |

### Do not ignore (commit these)

| Path | Why |
|------|-----|
| `.cursor/rules/graphify.mdc` | Shared Cursor rule so agents use the graph |
| `.codex/hooks.json` | Codex hook config from `graphify hook install` |
| `docs/graphify.md` | This guide |

Do not add `graphify-out/` to a Cursor ignore file — agents need to read `graph.json` and related outputs.

## HomeArpaDashboard notes

HomeArpaDashboard is a private LAN tool. Never commit `.env`, `API_KEY`, Pi-hole credentials, real LAN IPs, or generated reports containing private lab details.

Use the graph when changing service registration, DNS automation, Caddy snippet generation, OpenAPI docs, or browser UI behavior. Treat Graphify findings as navigation aids; the code remains the source of truth.
