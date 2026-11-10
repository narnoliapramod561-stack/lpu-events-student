# Student Web Portal Guidelines (`lpu-events-student`)

## Stack & Target Environment
- **Runtime & Build**: Vite 6, React 18, TypeScript, `@tailwindcss/vite` (Tailwind CSS v4).
- **Hosting / Edge**: Cloudflare Workers / Pages runtime (`wrangler.jsonc`).
- **Data Source**: Pre-generated edge snapshots stored on Cloudflare R2 (`packages/shared/src/snapshotClient.ts`).

---

## Tooling & MCP Protocols
- **Symbol & Component Navigation**: Use `codebase-memory` (`search_graph`, `trace_path`) to inspect student routes, layout trees, and shared imports.
- **API Documentation**: Use `context7` for Tailwind CSS v4 directives/theme syntax, Vite 6 configurations, and Cloudflare Pages/Worker bindings.
- **Verification**: Run `npm run typecheck` (`tsc --noEmit`) in this subfolder after edits. Do not run full project builds.

---

## Critical Architecture Guardrails
1. **Edge-First Public Data Access**:
   - All student views (feed, category filters, event details) MUST fetch exclusively from edge snapshot endpoints (`/api/snapshot` or R2 CDN URLs).
   - Direct database access via `@supabase/supabase-js` is strictly forbidden in client-side public views to protect database concurrency and eliminate egress costs.
2. **Tailwind CSS v4 Standard**:
   - Use CSS-first theme configuration `@import "tailwindcss";` in `src/index.css`.
   - Never inject legacy Tailwind v3 config files (`tailwind.config.js`).
3. **Execution Speed**:
   - Surgical edits only. Zero conversational fluff before or after code edits.

