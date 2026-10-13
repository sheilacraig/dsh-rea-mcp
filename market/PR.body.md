Adds one entry: `sheilacraig/dsh-rea-mcp`, category `tools`.

{{NPM_LINE}}

**What it is.** A configuration-only DeepSeek Harness bundle that mounts the in-box `@deepseek-ai/dsh-mcp-client` bridge against [morluto/rea](https://github.com/morluto/rea) over stdio — reverse engineer anything with agents, from app behavior down to native binaries. The whole plugin is one file, [`cordis.patch.yml`](https://github.com/sheilacraig/dsh-rea-mcp/blob/main/cordis.patch.yml): `npx -y rea-agents@6.4.0 mcp`, pinned. No Host code, no web route, no state file, no runtime dependency, no build step.

**What it deliberately is not.** Other MCP bridges in this ecosystem ship a Host half — an in-app dependency installer, their own HTTP routes, a doctor tool. This one ships none of that, so the entire integration can be read in one screen before installing something that can analyze binaries and drive a native disassembler on your machine. It pins the upstream version (`rea-agents@6.4.0`) so an upstream release cannot change what the bridge does under you, and it keeps `failOnStartupError: false` so a REA that cannot start leaves the rest of the harness working.

**Where to check those claims against the source:**

- [`cordis.patch.yml`](https://github.com/sheilacraig/dsh-rea-mcp/blob/main/cordis.patch.yml) — the pinned version and the startup defaults, as shipped.
- [`test/patch.test.mjs`](https://github.com/sheilacraig/dsh-rea-mcp/blob/main/test/patch.test.mjs) — `npm test` checks the pin, the subcommand, the timeout, the startup default, the display metadata, the submission rules, and that no machine-specific path can reach a published file.
- [`tools/prewarm.mjs`](https://github.com/sheilacraig/dsh-rea-mcp/blob/main/tools/prewarm.mjs) — runs the same argv the bridge runs and proves the pinned server answers the MCP handshake.

**Verified before submitting** on DSH 0.2.0-rc.2 (desktop, Windows 11): `npx -y rea-agents@6.4.0 mcp` answered `initialize` and `tools/list` successfully, returning the live REA tool set. Static JavaScript and .NET analysis need no native engine; native binary analysis uses an existing Hopper/Ghidra/IDA installation.

Maintenance: any change to the pin, the subcommand or the startup defaults has to keep that test suite green.