# Katavti Product Design Document

## 1. Purpose

Katavti is a rewrite of `workspace-notes`: a small browser application for creating, reading, editing, and finding filesystem-backed daily work notes. It preserves the existing on-disk layout while separating the Hono API from a Vue CLI client.

## 2. Source-system findings

The existing Nuxt application stores each user's notes below a configured data directory, using IDs such as:

`2026/september.d/workspaces-2026-09-25/workspace-1.md`

Its useful behavior is:

- create or extend today's set of numbered workspace notes;
- list non-empty notes from a configurable lookback period;
- filter all notes by exact `Bug: value` or `Label: value` lines;
- fetch one note with its content and date;
- update one note;
- render Markdown, switch to raw/edit mode, and copy content;
- provide a focused daily workspace and a historical/search view.

The rewrite deliberately does not carry forward Nuxt, server-side rendering, generated build artifacts, Prisma, or provider-specific authentication. Identity is represented by a required `x-user-id` request header in this initial codebase. It is a replaceable boundary, not production authentication; deployment must put a trusted identity-aware proxy in front of it before exposing the service.

## 3. Functional requirements

### API (`/api/v1beta`)

- `GET /notes?days=N`: return encoded IDs for non-empty notes within the last N days (default 5).
- `GET /notes?bug=VALUE`: return encoded IDs whose content has an exact bug/label line.
- `GET /notes/:id`: return `{ content, ISODateString, tags }`.
- `POST /notes/:id` with `{ content }`: replace note content and return the decoded ID.
- `PUT /notes/daily?num=N&date=YYYY-MM-DD`: idempotently create notes 1..N and return all encoded daily note IDs.
- `GET /health`: return service status.
- Reject missing identity, invalid inputs, traversal, missing files, and malformed bodies with appropriate 4xx responses.

### Client

- Historical page with lookback and label filters.
- Daily page that creates/opens four notes initially and can add another.
- Markdown and raw views, debounced saving, and copy action.
- Vuex owns filters, note entities, note IDs, daily IDs, loading, and error state.

## 4. Architecture

```text
server/src/
  app.ts                    composition root
  routes/health/            health API
  routes/notes/             list/read/update APIs
  routes/daily/             daily-note API
  services/                 filesystem domain service
client/src/
  api/                      HTTP adapter
  store/                    Vuex state/actions
  views/                    route-level screens
  components/               note UI
```

The domain service receives a filesystem adapter, clock, and data directory. Unit tests mock those dependencies. Route composition receives the service factory. End-to-end tests start the real Node HTTP server against a temporary directory and use real filesystem and HTTP operations—no mocks.

## 5. Data and safety

- User IDs are mapped to a safe directory segment rather than interpreted as paths.
- Note IDs are URL-decoded, resolved, and verified to remain under that user's directory.
- Existing `.md` and `.txt` files remain readable; the rewrite performs no migration.
- Daily creation is idempotent and never truncates existing files.
- Dates use the requested calendar date and the established directory convention.

## 6. Testing strategy

Every behavior follows red-green-refactor:

1. Add a focused unit test using an in-memory/mock filesystem boundary and observe failure.
2. Implement the smallest domain behavior and run all unit tests.
3. Add API E2E tests first and observe failure for the expected missing route/behavior.
4. Implement routes and run all tests.

E2E coverage exercises health, daily creation followed by list, read, update followed by read, label filtering, validation, identity isolation, and traversal rejection over a live ephemeral server with real disk storage.

## 7. Acceptance criteria

- `npm test` passes unit and E2E suites.
- `npm run build` type-checks/builds server and Vue client.
- Each API is implemented in its own route directory.
- E2E tests use neither module mocks nor fake storage.
- A fresh checkout can be started using documented commands.

## 8. Deferred work

- Replace trusted-header identity with OIDC/session middleware.
- Offline/local-browser mode and conflict resolution.
- Atomic writes/version checks for concurrent editors.
- Deployment manifests and data backup policy.
- Accessibility and browser-level UI E2E testing.
