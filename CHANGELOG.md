# Changelog

## 1.0.0 — 2026-10-13

First release.

- One-row configuration bundle: mounts the in-box `@deepseek-ai/dsh-mcp-client`
  bridge against `npx -y rea-agents@6.4.0 mcp` over stdio. No Host code, no web
  route, no state file, no runtime dependency.
- Tools arrive as `mcp__rea__<Tool>`; the exact set is upstream's live
  `tools/list`, so no fixed count is claimed.
- `failOnStartupError: false` keeps a REA that cannot start from bricking the
  harness; `toolCallTimeoutMs: 300000` accommodates long native-analysis runs.
- `npm run prewarm` installs and verifies the upstream server outside DeepSeek
  Harness, so the first in-harness start is not a cold `npx` download.
- `npm test` asserts the bridge invariants, including that no machine-specific
  absolute path can reach the published package.