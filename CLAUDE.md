# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## This checkout is a fork

This is Greenberry's fork of Mintplex-Labs/anything-llm. Remotes: `origin` = upstream Mintplex, `fork` = basvanbokhorst/anything-llm. Production branches are named `greenberry-production-<upstream version>[-suffix]` and consist of an upstream release plus a small stack of Greenberry commits on top (theme, Anthropic Claude 5 fixes, multilingual reranker). The local `master` tracks `fork/master` (an old upstream base plus a couple of Greenberry commits), not upstream; compare against `origin/master` or the upstream release tag (e.g. `v1.16.2`) instead. To see fork-only changes: `git log --oneline v1.16.2..HEAD`.

Fork-specific code is marked with a `// Greenberry:` comment explaining why it differs from upstream. Keep changes surgical so the stack stays rebaseable onto new upstream releases.

If a fix is meant to go upstream: upstream's CONTRIBUTING.md requires a linked issue, conventional-commit PR titles, real tests, and **rejects PRs with Claude Code / agent signatures in the commit history**.

## Commands

Node >= 18 (`.nvmrc`: 18.18.0), Yarn. Three separate packages (`server`, `collector`, `frontend`), each with its own `node_modules` and `yarn.lock`; there is no workspace setup.

```bash
yarn setup              # install all three packages, copy .env.example files, prisma generate+migrate+seed
yarn dev                # server (3001) + frontend (Vite) + collector (8888) concurrently
yarn dev:server | dev:frontend | dev:collector   # run one

yarn lint               # eslint --fix in server, frontend (src/), collector
yarn lint:ci            # check only

yarn test                                        # jest from repo root (server + collector __tests__)
npx jest server/__tests__/models/user.test.js    # single file
npx jest -t "name of test"                       # single test by name

yarn prisma:generate    # after editing server/prisma/schema.prisma
yarn prisma:migrate     # create/apply a migration (SQLite at server/storage/anythingllm.db)
yarn prod:frontend      # production frontend build
yarn translations:verify   # CI checks that all locales have the same keys as en
```

Tests only exist for server and collector (`server/__tests__`, `collector/__tests__`, mirroring the source tree); the frontend has none. CI runs backend tests only on PRs touching `server/**.js` or `collector/**.js`.

## Architecture

Three Node processes:

- **server/** – Express API (port 3001) + websockets. Owns the SQLite DB (Prisma), auth, workspaces, chat, vector DB access and agents.
- **collector/** – Express service (port 8888) that turns files/links/data connectors into text documents (PDF/OCR, audio transcription, web scraping, GitHub/Confluence/etc. in `collector/extensions`). Server talks to it only via `server/utils/collectorApi`, with requests signed by `server/utils/comKey`. Files dropped for processing go through `collector/hotdir`.
- **frontend/** – React + Vite + Tailwind SPA. API calls live in `frontend/src/models/*` (one module per domain), pages in `src/pages`, i18n strings in `src/locales` (all UI strings must go through i18n; `en` is the source of truth). Theme is resolved in `src/hooks/useTheme.js` with CSS variables in `src/index.css`.

Other top-level dirs (`embed`, `browser-extension`, `open-computer`, `cloud-deployments`, `docker`) are separate products/deploy targets, not part of the core dev loop.

### Provider pattern (the thing that spans the most files)

Almost every external integration is a pluggable provider selected by an ENV var:

- LLMs: `server/utils/AiProviders/<name>/index.js`, chosen by `LLM_PROVIDER` in `getLLMProvider()` (`server/utils/helpers/index.js`). Same file holds `getVectorDbClass()` (`VECTOR_DB` → `server/utils/vectorDbProviders/*`) and `getEmbeddingEngineSelection()` (`EMBEDDING_ENGINE` → `server/utils/EmbeddingEngines/*`).
- Agent LLMs are a **separate** implementation: `server/utils/agents/aibitat/providers/*.js`. A behavioral fix in `AiProviders/anthropic` does not automatically apply to agent chats — check both.
- Reranker: `server/utils/EmbeddingRerankers/native` (local ONNX model via transformers.js, cached in `$STORAGE_DIR/models`).
- Also pluggable: TextToSpeech, SpeechToText, ImageGenerators.

Adding a provider typically touches: the provider class, the switch in `helpers/index.js`, `KEY_MAPPING` + validators in `server/utils/helpers/updateENV.js`, `server/models/systemSettings.js` (to expose current settings), `server/utils/helpers/customModels.js` (model listing), the aibitat provider, and a frontend options component + logo.

### Settings and ENV

Most admin settings are persisted as environment variables, not DB rows: the UI posts to the server, `updateENV()` validates via `KEY_MAPPING`, sets `process.env`, and `dumpENV()` overwrites `server/.env` with only the whitelisted keys, so anything else in that file is lost. In dev the server loads `server/.env.development` instead, which `yarn setup` creates. New ENV keys must be added to `KEY_MAPPING` (or the `protectedKeys` list in `dumpENV`) or they will be dropped on the next save. Workspace-level and remaining system settings live in the Prisma DB (`server/models/*` are thin model wrappers around the Prisma client).

### Chat / RAG flow

`server/endpoints/chat.js` → `server/utils/chats/stream.js`: resolves the workspace's LLM + vector DB, runs similarity search (optionally reranked), fills the context window (`fillSourceWindow`), and streams the completion. `@agent` invocations are handed to the agent system instead (`server/utils/chats/agents.js` → `server/utils/agents` → aibitat over a websocket, `server/endpoints/agentWebsocket.js`). Built-in agent skills are aibitat plugins in `server/utils/agents/aibitat/plugins`; agent flows and MCP servers are in `utils/agentFlows` and `utils/MCP`. `server/endpoints/api` is the public developer API (documented via `server/swagger`).

### Storage

Everything stateful sits under `server/storage` (or `STORAGE_DIR` in Docker): the SQLite DB, processed documents (JSON), vector cache, LanceDB data, downloaded models. Don't commit anything from there.
