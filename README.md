# Preyam Rao — Personal Website

A responsive personal portfolio built as a live systems observatory: a procedural signal field, evidence-led project case studies, field notes, and a separate editorial reading mode for long-form dispatches.

## Stack

- Next.js 16, React 19, and strict TypeScript
- Tailwind CSS v4 plus scoped custom CSS
- Canvas 2D for the interactive signal field
- Framer Motion and Three.js for experimental routes
- MDX for dispatches
- Jest for unit tests

## Commands

```bash
npm install
npm run dev
npm run lint
npm test -- --runInBand
npm run build
npm start
```

## Structure

- `src/app/page.tsx` — portfolio composition and project content
- `src/components/SignalField.tsx` — deterministic pointer-reactive hero canvas
- `src/app/globals.css` — shared editorial styles plus the scoped observatory system
- `src/content/dispatches/` — MDX writing
- `src/app/lab/` and `src/app/lab-3d/` — experimental interaction routes

## Codex design workflow

The reliable workflow for a visual build is concept first, implementation second, browser evidence third:

1. Research a small set of live reference sites and extract principles, not surface styling.
2. Define the subject, audience, palette, type roles, layout, and one signature interaction.
3. Use ImageGen for a visual-direction checkpoint when the concept is still ambiguous.
4. Implement the chosen direction in the existing framework and content model.
5. Compare desktop and mobile renders in Playwright, then iterate on real screenshots.
6. Run lint, tests, and the production build before claiming completion.

Useful Codex skills for this workflow are `frontend-design`, `imagegen`, `browser-e2e`, `research-current`, and `ship-check`. A plugin is not required for a one-off personal workflow; plugins are useful when packaging skills or MCP tools for reuse or distribution. In Codex CLI, invoke installed skills with `$skill-name`, browse plugins with `/plugins`, and keep durable project constraints in `AGENTS.md`.

Official references: [responsive frontend workflow](https://learn.chatgpt.com/use-cases/frontend-designs), [idea to proof of concept](https://learn.chatgpt.com/use-cases/idea-to-proof-of-concept), [build skills](https://learn.chatgpt.com/docs/build-skills), and [plugins](https://learn.chatgpt.com/docs/plugins).

## Deployment

The production site is configured for Vercel. Set `NEXT_PUBLIC_SITE_URL` for a custom canonical origin; otherwise it falls back to `https://preyam-rao.vercel.app`.
