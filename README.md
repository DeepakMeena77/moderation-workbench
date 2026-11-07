# Content Moderation and Appeals Workbench

[![CI](https://github.com/DeepakMeena77/moderation-workbench/actions/workflows/ci.yml/badge.svg)](https://github.com/DeepakMeena77/moderation-workbench/actions/workflows/ci.yml)

An AI-assisted text moderation app. **The AI recommends; humans decide.**

> Stub (slice S0). The full README - live link, demo logins, 5-minute demo, acceptance -> evidence table,
> architecture, limitations and deployment log - is written in S9.

- Live app: _added after the first deploy_
- Status page: `/status` (public)

## Setup

Requirements: Node.js 22 (see `.nvmrc`) and a Neon Postgres project.

```bash
npm ci
```

Create `.env` (local development) and `.env.test` (integration tests) from `.env.example`. Never commit
them. `.env.test` must point at a dedicated test database and set `TEST_DATABASE=true`.

```bash
npm run dev          # http://localhost:3000
```

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Local app |
| `npm run build` / `npm run start` | Production build and server |
| `npm run verify` | Repo guard, ASCII check, UI rules, lint, typecheck and tests |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run test:ui` | UI quality suite (Playwright + axe); run `npm run build` first |
| `npm run check:trace -- --slice S0` | Which acceptance criteria of a slice have tests |
| `npm run db:migrate` | Prisma migrate (development) |
| `npm run db:seed` | Seed the six demo users (idempotent; needs `DEMO_PASSWORD`, at least 12 characters) |

## Documentation

- [Requirements and acceptance criteria](docs/01-requirements.md)
- [System design](docs/02-system-design.md)
- [UI/UX and design system](docs/03-ui-ux.md)
- [Build plan](docs/04-build-plan.md)
- [Test plan](docs/05-test-plan.md)
