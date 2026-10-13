# Submitting this plugin

This repository is ready locally. What remains is done by hand with the GitHub
CLI (`gh`) — this document is the checklist. Replace the button-taps below with
whatever you normally use; they are the GitHub-equivalent steps.

## 0. Prerequisites (one browser confirmation)

```sh
gh auth login
```

Create the repository `sheilacraig/dsh-rea-mcp` on GitHub (public), then:

```sh
git remote add origin https://github.com/sheilacraig/dsh-rea-mcp.git
git push -u origin main
```

The repo is the same account the previous Windows-MCP plugin used, so at least
one day from its `created_at` must pass before the list CI will accept a
submission.

## 1. Add the `dsh-plugin` topic

The curated list CI rejects a submission without it.

```sh
gh api --method PUT /repos/sheilacraig/dsh-rea-mcp/topics \
  -f 'names[]=dsh-plugin' \
  -f 'names[]=dsh' \
  -f 'names[]=deepseek-harness' \
  -f 'names[]=mcp' \
  -f 'names[]=rea' \
  -f 'names[]=reverse-engineering'
```

Verify `gh api repos/sheilacraig/dsh-rea-mcp --jq .topics`.

## 2. Run the checks

```sh
npm install
npm test
npm run prewarm
```

`npm test` enforces the repository's claims (single bridge row, pinned version,
startup defaults, submission rules, no absolute path). `npm run prewarm`
downloads and verifies `rea-agents@6.4.0` against the real MCP handshake —
do this once so the first in-harness start is not a cold `npx` download.

## 3. Publish to npm (recommended, optional)

Publishing gives the market card a download count.

```sh
npm publish
```

The `prepublishOnly` script runs `npm test` and a syntax check before publish.

## 4. Submit to the curated list

The list `awesome-dsh-plugin/awesome-dsh-plugin` is the only route into the
`dsh-market` storefront. With `gh` authenticated:

```sh
# fork, create branch, commit the entry file, open the PR
gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone=false

# branch off the fork's default branch
gh api --method POST \
  /repos/sheilacraig/awesome-dsh-plugin/git/refs \
  -f ref=refs/heads/add-dsh-rea-mcp \
  -f sha=<the fork default branch sha>

# write data/plugins/sheilacraig__dsh-rea-mcp.yml with the contents of
# market/awesome-dsh-plugin.yml
gh api --method PUT \
  /repos/sheilacraig/awesome-dsh-plugin/contents/data/plugins/sheilacraig__dsh-rea-mcp.yml \
  -f message='Add sheilacraig/dsh-rea-mcp' \
  -f branch=add-dsh-rea-mcp \
  -f content="$(base64 -w0 < market/awesome-dsh-plugin.yml)"

# title / body
title=$(cat market/PR.title.txt)
body=$(sed "s/{{NPM_LINE}}//g" market/PR.body.md; printf '\n')

gh pr create \
  --repo awesome-dsh-plugin/awesome-dsh-plugin \
  --base main \
  --head sheilacraig:add-dsh-rea-mcp \
  --title "$title" \
  --body "$body"
```

The steps above are exactly what the previous plugin's `.market-submit/submit.mjs`
automates; you can copy that script and adapt `config.json` if you prefer the
checked, idempotent path over raw API calls.