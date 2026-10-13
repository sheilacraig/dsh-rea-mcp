# dsh-rea-mcp

**A config-only bridge from [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) to [REA — Reverse Engineer Anything](https://github.com/morluto/rea).**

[中文](README.zh.md) · English

It mounts the MCP client bridge that ships inside DeepSeek Harness and points it at REA's MCP server over stdio. The whole integration is a single file, [`cordis.patch.yml`](cordis.patch.yml) — about 20 lines, no JavaScript, small enough to read in full before you install it.

```text
DSH agent
  └─ mcp__rea__analyze_binary / search / decompile / ...
       └─ @deepseek-ai/dsh-mcp-client        (ships with DSH)
            └─ npx -y rea-agents@6.4.0 mcp   (stdio child process)
                 └─ REA analysis engines
                      ├─ static JavaScript / .NET  (no native engine needed)
                      ├─ native binaries           (Hopper / Ghidra / IDA)
                      └─ runtime & web capture     (your user permissions)
```

[REA](https://rea.tools/) connects your agent to tools for inspecting native binaries, JavaScript and Electron apps, .NET assemblies, websites, network captures, Android APKs, firmware, SQLite snapshots and more. Analysis runs locally and returns evidence and limitations behind each conclusion. This bundle wires that into DeepSeek Harness as a plugin.

## What it deliberately is not

These are design choices, not a list of missing features:

- **No Host plugin.** No `index.js`; no code of ours ever runs inside your harness process.
- **No web route.** No new HTTP endpoint, so no new unauthenticated attack surface, and no reason to bind yet another path to loopback.
- **No state file.** Reads and writes nothing under `~/.dsh/...state.json`.
- **No installer that edits your profile.** `npm run prewarm` installs and verifies the upstream server in *your own terminal*; it never rewrites a profile patch.
- **No runtime dependency, no build step.** `dependencies` is empty; nothing to compile; no `allowBuilds` to grant.
- **No machine-specific absolute path.** The bridge resolves `npx` from PATH; this repository's test fails the build if any machine-related path leaks into a published file.
- **No `peerDependencies`.** The row merely *names* `@deepseek-ai/dsh-mcp-client` and never imports it; DSH resolves its bundled copy from its own install, exactly like the official `templates/mcp` combo bundles. A peer would impose a hard activation gate whose prerelease SemVer rules silently reject legitimate hosts; the host range lives on `engines.dsh` for the market card instead.
- **No `screenshots.json`.** There is no UI to photograph.

If you want an in-app dependency installer or a doctor tool, this ecosystem has plugins for that. This one trades them for "small enough to audit on one screen".

## Prerequisites

- **A DeepSeek Harness that carries the in-box MCP client bridge** — declared range `>=0.2.0-rc.1 <0.3.0-0`; verified by the author on **0.2.0-rc.2** (desktop). The range is a declaration; the test is on that one build; the two are not the same thing.
- **Node.js on the PATH of the process that runs DSH.** `npx` launches `rea-agents`, which requires **Node 22.x (>=22.19), 24.x (>=24.11), or 26+** and npm. The author tested on Node 24.
- **Optional — a native analysis engine for deep binary work:** an existing Hopper, Ghidra, or IDA installation. Static JavaScript and .NET inspection need none.

## Install

In-app: **Settings → Plugins → Add plugin**, paste one of:

```text
dsh-rea-mcp                                  # the npm package name
github:sheilacraig/dsh-rea-mcp               # the GitHub repository
C:\path\to\a\local\checkout                  # a local absolute path
```

For a CLI-held profile:

```sh
dsh plugin --profile <profile> add dsh-rea-mcp
```

The Electron desktop's own `desktop` profile belongs to the app; use its plugin panel.

Then **restart DSH** so the new patch layer is composed at startup.

## First start is the slow one

`npx` downloads `rea-agents@6.4.0` and its dependencies on first use. On a slow link that is a while, and the harness gives up on the initial MCP connection long before that finishes. Cache it outside the harness first, where there is no timeout:

```sh
npm run prewarm
```

The script runs `npx -y rea-agents@6.4.0 mcp` — **the same argv the bridge runs** — speaks initialize + tools/list to it, prints the server identity, the latency and the full tool list, then exits. It launches the very process the bridge will launch, so success here means there is nothing left to download or discover on the harness side.

## What the model can reach

Tools arrive named `mcp__rea__<Tool>`. The exact set is what upstream `rea-agents@6.4.0` publishes and can vary slightly by release, so this plugin does not claim a fixed count — run `npm run prewarm` to see the live list. Capabilities include:

| Area | What REA returns |
| --- | --- |
| Native binaries | pseudocode, assembly, strings, symbols, calls and references |
| Go binaries | embedded compiler version, modules, replacements, build settings |
| WASM / EVM / firmware | sections, WAT forms, dispatch selectors, region extraction |
| JavaScript / Electron | modules, imports, source maps, routes, IPC, native add-ons |
| .NET assemblies | metadata, CIL instructions, native dependencies, build comparisons |
| Android APKs / devices | manifests, decompiled methods, packages, processes, dumps |
| Websites | page structure, scripts, network observations, screenshots |
| SQLite / crashes / captures | tables, registers/signals, requests, exposed payloads, packets |

Static JavaScript and .NET inspection read the supplied files without running the app. Runtime capture and device workflows run the selected target with **your user permissions**; consult each REA guide before enabling those.

## Verification

1. Run `npm run prewarm` once — it verifies the server and the exact pinned version.
2. In DSH, ask the agent to call something read-only, e.g. `mcp__rea__inspect_go_binary` against a Go binary you own, or a static `.NET` inspection.

## Security

This hands an agent the ability to read and analyze binaries on your machine, and (for native analysis) to drive an installed Hopper/Ghidra/IDA.

- **stdio, not a listening port.** The bridge spawns a pipe-connected child; nothing binds a socket.
- **Least surprise by default.** `failOnStartupError: false` means a REA that cannot start logs the reason and leaves the rest of the harness working.
- **The harness file sandbox does not govern the child.** MCP tool calls are ordinary tool calls — approval policy can intercept them; the sandbox implementation lives in the harness's own file and shell tools, not here.
- **Investigate only what you own or are authorised to.** REA itself ships a responsible-use disclaimer; this bridge adds none of its own beyond that.
- **Pinned upstream.** `rea-agents@6.4.0` is fixed; an upstream release cannot silently change what this bridge does. Bump it deliberately, then re-run `npm run prewarm`.
- **Read [`cordis.patch.yml`](cordis.patch.yml) before installing.** That file *is* the plugin; everything else is metadata, docs, and tests.

## Troubleshooting

| Symptom | Cause & fix |
| --- | --- |
| No `mcp__rea__*` tools | The bridge could not start the server. Run `npm run prewarm` in a terminal; it fails with the same reason. Most common cause: the process that runs DSH has no usable Node/npm on PATH (a desktop shortcut or editor can carry a different PATH than your terminal). The harness log has a `mcp-client(rea)` line. |
| Native analysis fails with "provider unavailable" | REA found no Hopper/Ghidra/IDA for that binary format. Static JavaScript and .NET analysis do not need one. Configure a provider per REA's installation guide, or raise `REA_GHIDRA_STARTUP_TIMEOUT_MS` / `REA_HOPPER_STARTUP_TIMEOUT_MS` for large binaries. |
| Tools are missing after an upgrade | The tool set is what the pinned version publishes. Bumping the pin can rename or add tools; check `npm run prewarm` and your prompts. |
| A runtime-capture call exposes a file it should not | Those workflows run with your permissions. Scope what you point REA at; do not run them against sensitive targets. |

## Development

```sh
npm install     # only devDependency: js-yaml, used by the test
npm test        # node --test — enforces this repository's claims
npm run prewarm # install and verify the upstream REA server
```

`npm test` mechanically enforces: exactly one insert row pointing at `@deepseek-ai/dsh-mcp-client`; `serverName` follows the tool-name namespace rule; the pinned `rea-agents@<x.y.z>` matches the prewarm script; `failOnStartupError` and the timeout are the documented values; the market entry obeys the curated-list submission rules; and no published file embeds an absolute path or drive letter.

## Uninstall

Remove this bundle under **Settings → Plugins**, or delete the row from your profile patch. Uninstalling revokes the whole row. No residual files: the plugin writes nothing.

## License & acknowledgements

MIT — see [LICENSE](LICENSE).

- The actual reverse engineering comes from [morluto/rea](https://github.com/morluto/rea) (MIT); this repository only wires it in.
- The MCP client bridge belongs to DeepSeek Harness; this repository does not distribute it.
- No affiliation with DeepSeek or with REA's authors.