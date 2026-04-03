# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GameVault Ecosystem is a monorepo game collection management system built with pnpm workspaces. It has a web admin dashboard, a mobile app for scanning/user access, shared TypeScript types, and a Supabase backend.

## Commands

### Root (run from repo root)
```bash
pnpm dev:web          # Start web dashboard
pnpm dev:mobile       # Start mobile app (Expo)
pnpm dev:all          # Start all apps concurrently
```

### Web App (`apps/web/`)
```bash
pnpm dev              # Vite dev server
pnpm build            # tsc -b && vite build
pnpm lint             # ESLint
pnpm preview          # Preview production build
```

### Mobile App (`apps/mobile/`)
```bash
pnpm start            # Expo start (interactive)
pnpm android          # Open in Android emulator
pnpm ios              # Open in iOS simulator
pnpm lint             # expo lint
```

### Workspace-scoped commands from root
```bash
pnpm --filter web <script>
pnpm --filter mobile <script>
pnpm --filter @gamevault/shared <script>
```

### Supabase
```bash
supabase start        # Start local Supabase stack (port 54321)
supabase db push      # Apply migrations
supabase gen types typescript --local > packages/shared/src/database.types.ts
```

## Architecture

### Monorepo Layout
- `apps/web/` — React 19 + Vite + Tailwind CSS admin dashboard
- `apps/mobile/` — Expo + React Native mobile app (barcode scanning, user auth)
- `packages/shared/` — Auto-generated Supabase database types shared by both apps
- `supabase/` — Schema migrations, Edge Functions, local config

### Backend: Supabase
Four core tables with Row-Level Security on all:
- `profiles` — Synced from auth via trigger; stores role (admin/user)
- `games` — IGDB game metadata cache
- `inventory_items` — Physical copies with barcodes (EAN-13, UPC-A)
- `loans` — Loan tracking with due dates

Realtime subscriptions via Postgres changes power live updates in the web dashboard. Twitch OAuth is used for IGDB game lookup.

### Web App (`apps/web/src/`)
`App.tsx` is the root `AdminDashboard` component. Key structure:
- `components/Layout/` — Sidebar navigation
- `components/Views/` — CollectionView, LoanView, UserManagement
- `components/Modals/` — CRUD dialogs
- `lib/supabase.ts` — Supabase client (uses `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)

### Mobile App (`apps/mobile/app/`)
File-based routing via Expo Router:
- `_layout.tsx` — Root layout with auth gate
- `(tabs)/` — Tab navigator screens
- `AccountScreen`, `LoginScreen`, `ProfileScreen`, `ScannerScreen`

### Shared Types (`packages/shared/src/database.types.ts`)
Auto-generated from Supabase schema — do not edit manually. Regenerate with `supabase gen types` after schema changes.

### Environment Variables
- Web: `apps/web/.env.local` → `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Mobile: `apps/mobile/.env` (multiple variants: `.env.casa`, `.env.ngrok`, `.env.trabajo`)
- Root: `.env` → `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` (for IGDB integration)
