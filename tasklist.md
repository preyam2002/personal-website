# Personal Website Tasklist

Generated 2026-05-25 from Codex memory and local website repo context.

## P0 - Deployment health

- [ ] Check Vercel status after dependency or deploy changes; GitHub push is not the same as deployed.
- [ ] Keep `next-mdx-remote`, `next`, `eslint-config-next`, and Jest stack on secure compatible versions.
- [ ] Run `npm audit` with a writable cache before pushing dependency changes.

## P1 - Validation

- [ ] Run `npm run lint`.
- [ ] Run `npm test -- --runInBand`.
- [ ] Run `npm run build`.
- [ ] Confirm Vercel status for the pushed commit if deployment matters.

## P2 - Known local notes

- [ ] Preserve the `Reveal.tsx` `requestAnimationFrame` fallback pattern; direct `setState` in `useEffect` failed lint.
- [ ] Use a temp npm cache when root-owned local npm cache blocks installs.

## Validation anchors

- Lint, tests, build, audit, and Vercel status when deploying.
