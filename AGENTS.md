# Festival Planner Project Instructions

## Required Validation

Before committing application changes:

1. Run `npm run build`.
2. Test affected interactions at a mobile viewport.
3. Run `git diff --check`.

## PWA Releases

This project is deployed as a PWA on GitHub Pages.

- When a release changes application code, styling, the app shell, icons, or other
  cached assets, increment `CACHE_NAME` in `public/sw.js`.
- Keep the Vite base path and PWA URLs under `/festival-planner/`.
- Do not consider a PWA fix published until the new service worker and Pages
  deployment are live.

## Commit And Deploy

For completed project changes:

1. Review `git status` and the intended diff.
2. Commit only the relevant files with a concise message.
3. Push the commit to `origin/main`.
4. Confirm the `Deploy GitHub Pages` workflow succeeds.
5. Verify the live application at:
   `https://eikkuu.github.io/festival-planner/`

A local commit alone does not update GitHub Pages. When the user asks to commit
finished work, ask whether they want a local commit only if that distinction
matters; otherwise, for this project, complete the push and deployment
verification as part of publishing the change.
