---
name: nextjs-developer
description: "Senior Next.js (14+) developer guidance: App Router structure, layouts, loading/error states, Server vs Client Components, Server Actions, data fetching and caching, Metadata API for SEO, next/image and next/font, streaming, and production builds (standalone/Docker). Use when building or reviewing the ShipCheck web app in apps/web (landing page, live job page, report components, How it works page), or for any Next.js, App Router, React Server Components or Next.js deployment question. ShipCheck's build steps take precedence over the general rules here."
---

# Next.js Developer

| | |
|---|---|
| **Domain** | Frontend & Mobile |
| **Role** | specialist |
| **Scope** | implementation |
| **Output** | code |

**Triggers:** Next.js, Next.js 14, App Router, Server Components, Server Actions, React Server Components, Next.js deployment, Vercel, Next.js performance

> **Related skill:** TypeScript Pro (from the same collection, https://github.com/jeffallan/claude-skills; not installed here).

Senior Next.js developer with expertise in Next.js 14+ App Router, server components, and full-stack deployment with focus on performance and SEO excellence.

## ShipCheck overrides (read first)

The ShipCheck web app is specified file by file in [03-build-steps.en.md](../../../planning/03-build-steps.en.md), Phase 6 (and Step 7.1 for its Dockerfile). **Where the build steps and the general rules below disagree, the build steps win.** The known differences:

| General rule below | ShipCheck (build steps) | Why |
|---|---|---|
| TypeScript (`.tsx`) | **JavaScript** (`.js` / `.jsx`): `create-next-app ... --js --tailwind --eslint --app --no-src-dir` | Team choice; the build files are written in JS |
| Server Components by default | `UrlForm`, `JobLive`, `StageStepper`, `AgentView`, `Timeline`, `ContainmentPanel` and `Report` are `'use client'` | The live job page reads **Server-Sent Events** from the api in the browser |
| Server Actions for mutations | No Server Actions: the browser calls the Express **api** (`/api/jobs`) through `lib/api.js` | All logic and secrets live in the api, not in Next.js |
| `next/image` for every image | Plain `<img>` for screenshots (`npm run lint` warnings about `<img>` are expected) | Screenshots come from Vultr Object Storage or the api at runtime; `next/image` would need `remotePatterns` and an optimizer for no gain |
| Deploy to Vercel | **Self-hosted**: `output: 'standalone'` in `next.config.mjs`, a multi-stage `node:24-bookworm-slim` Dockerfile running as `node`, behind Caddy on the Vultr VM | The hackathon requires the web app to run on Vultr |
| Core Web Vitals > 90 as a deploy gate | Not a gate | The Phase 8 checks (e.g. readable at 375 px) are what matter |

Still apply from this skill: App Router only (never `pages/`), the `metadata` export for page titles, `loading.js` / `error.js` where a segment fetches data on the server, and **always run `next build` before deploying** (it also runs on the VM inside the Docker build; watch memory, Step 1.4 adds swap). `NEXT_PUBLIC_API_BASE` is a **build-time** argument (empty in production, because Caddy serves the api on the same host).

## Core Workflow

1. **Architecture planning** — Define app structure, routes, layouts, rendering strategy
2. **Implement routing** — Create App Router structure with layouts, templates, loading/error states
3. **Data layer** — Set up server components, data fetching, caching, revalidation
4. **Optimize** — Images, fonts, bundles, streaming, edge runtime
5. **Deploy** — Production build, environment setup, monitoring
   - Validate: run `next build` locally, confirm zero type errors, check `NEXT_PUBLIC_*` and server-only env vars are set, run Lighthouse/PageSpeed to confirm Core Web Vitals > 90

## Reference Guide

Load detailed guidance based on context (external, from the original skill repository):

| Topic | Reference | Load When |
|-------|-----------|-----------|
| App Router | [references/app-router.md](https://github.com/jeffallan/claude-skills/blob/main/skills/nextjs-developer/references/app-router.md) | File-based routing, layouts, templates, route groups |
| Server Components | [references/server-components.md](https://github.com/jeffallan/claude-skills/blob/main/skills/nextjs-developer/references/server-components.md) | RSC patterns, streaming, client boundaries |
| Server Actions | [references/server-actions.md](https://github.com/jeffallan/claude-skills/blob/main/skills/nextjs-developer/references/server-actions.md) | Form handling, mutations, revalidation |
| Data Fetching | [references/data-fetching.md](https://github.com/jeffallan/claude-skills/blob/main/skills/nextjs-developer/references/data-fetching.md) | fetch, caching, ISR, on-demand revalidation |
| Deployment | [references/deployment.md](https://github.com/jeffallan/claude-skills/blob/main/skills/nextjs-developer/references/deployment.md) | Vercel, self-hosting, Docker, optimization |

## Constraints

### MUST DO (Next.js-specific)
- Use App Router (`app/` directory), never Pages Router (`pages/`)
- Keep components as Server Components by default; add `'use client'` only at the leaf boundary where interactivity is required
- Use native `fetch` with explicit `cache` / `next.revalidate` options — do not rely on implicit caching
- Use `generateMetadata` (or the static `metadata` export) for all SEO — never hardcode `<title>` or `<meta>` tags in JSX
- Optimize every image with `next/image`; never use a plain `<img>` tag for content images
- Add `loading.tsx` and `error.tsx` at every route segment that performs async data fetching

### MUST NOT DO
- Convert components to Client Components just to access data — fetch server-side first
- Skip `loading.tsx`/`error.tsx` boundaries on async route segments
- Deploy without running `next build` to confirm zero errors

## Code Examples

### Server Component with data fetching and caching
```tsx
// app/products/page.tsx
import { Suspense } from 'react'

async function ProductList() {
  // Revalidate every 60 seconds (ISR)
  const res = await fetch('https://api.example.com/products', {
    next: { revalidate: 60 },
  })
  if (!res.ok) throw new Error('Failed to fetch products')
  const products: Product[] = await res.json()

  return (
    <ul>
      {products.map((p) => (
        <li key={p.id}>{p.name}</li>
      ))}
    </ul>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ProductList />
    </Suspense>
  )
}
```

### Server Action with form handling and revalidation
```tsx
// app/products/actions.ts
'use server'

import { revalidatePath } from 'next/cache'

export async function createProduct(formData: FormData) {
  const name = formData.get('name') as string
  await db.product.create({ data: { name } })
  revalidatePath('/products')
}

// app/products/new/page.tsx
import { createProduct } from '../actions'

export default function NewProductPage() {
  return (
    <form action={createProduct}>
      <input name="name" placeholder="Product name" required />
      <button type="submit">Create</button>
    </form>
  )
}
```

### generateMetadata for dynamic SEO
```tsx
// app/products/[id]/page.tsx
import type { Metadata } from 'next'

export async function generateMetadata(
  { params }: { params: { id: string } }
): Promise<Metadata> {
  const product = await fetchProduct(params.id)
  return {
    title: product.name,
    description: product.description,
    openGraph: { title: product.name, images: [product.imageUrl] },
  }
}
```

## Output Templates

When implementing Next.js features, provide:
1. App structure (route organization)
2. Layout/page components with proper data fetching
3. Server actions if mutations needed
4. Configuration (`next.config.js`, TypeScript)
5. Brief explanation of rendering strategy chosen

## Knowledge Reference

Next.js 14+, App Router, React Server Components, Server Actions, Streaming SSR, Partial Prerendering, next/image, next/font, Metadata API, Route Handlers, Middleware, Edge Runtime, Turbopack, Vercel deployment
