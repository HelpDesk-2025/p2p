# Testing

100% test coverage is the key to great vibe coding. Tests let you move fast, trust
your instincts, and ship with confidence — without them, vibe coding is just yolo
coding. With tests, it's a superpower.

## Framework

[Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/react)
+ jsdom.

## Running tests

```bash
npm run test         # run once (CI mode)
npm run test:watch   # watch mode for local development
```

## Test layers

- **Unit tests** — pure functions in `src/lib/*.test.ts` (permissions, formatting,
  helpers). No mocking needed; these are the fastest and most reliable tests.
- **Integration tests** — component behavior in `src/**/*.test.tsx`, using
  `@testing-library/react`. Mock Supabase calls (`src/lib/supabase.ts`) rather than
  hitting the real backend.
- **Smoke tests** — none yet; add as the suite grows.
- **E2E tests** — none yet; this project uses `/qa` (gstack browse) for
  browser-based end-to-end verification instead of a dedicated e2e framework.

## Conventions

- File naming: `<subject>.test.ts` / `<subject>.test.tsx`, colocated next to the
  file under test.
- Structure: `describe('<subject>', () => { it('<behavior>', () => { ... }) })`.
- Assertions: `expect(...).toBe(...)` / `toEqual(...)` — assert real behavior and
  outcomes, never `toBeDefined()`-style placeholder checks.
- Regression tests carry an attribution comment pointing back to the QA report
  that found the bug, e.g.:
  ```ts
  // Regression: ISSUE-003 — search input didn't debounce
  // Found by /qa on 2026-07-03
  // Report: .gstack/qa-reports/qa-report-...-2026-07-03.md
  ```
