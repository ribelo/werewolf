# Agent Notes

## Internationalization setup
- Default UI language is Polish (`pl`). English (`en`) is configured as the fallback locale.
- Translation bundles live in `apps/web/src/lib/i18n/locales/`. Every user-facing string must have entries in **both** `en.json` and `pl.json`. Keep keys alphabetised where practical.
- `setupI18n()` registers locales and must be awaited before rendering. The root load function (`apps/web/src/routes/+layout.js`, SSR disabled) already awaits it; client code should keep calling `setupI18n()` when switching users/locales.
- To change the active language at runtime call `changeLanguage(code)`. This updates `svelte-i18n`, persists the preference in `localStorage`, and PUTs `/settings/language` so the backend remembers it. Wrap calls in try/catch and surface failures via the toast system.
- When adding a new locale:
  1. Drop a `xx.json` file next to the existing bundles.
  2. Add `{ code: 'xx', label: '…' }` to `availableLocales` in `apps/web/src/lib/i18n/index.ts`.
  3. Register the bundle with `register('xx', () => import('./locales/xx.json'))` inside the same module.
  4. Update any language selectors in the UI (settings page, future wizard steps).

## Rendering guidelines
- Use `$format` (`$_('key', { values: { … } })`) from `svelte-i18n` for interpolated strings.
- Server builds now suppress missing-key crashes by returning an empty string—still, ensure every key exists to keep the UI readable.
- `src/lib/i18n/__tests__/catalog.test.ts` fails when a literal key is missing from either catalog or the catalogs drift apart.

## Verification checklist after i18n changes
- `cd werewolf-cloud && bun run check`
- Run the dev stack (`bun run dev` in `werewolf-cloud/`, `PUBLIC_API_BASE=http://127.0.0.1:8787 bun run dev` in `apps/web`) and confirm `/settings` renders without console errors.

Keep this file current when flows change so the next agent can jump in without re-discovering these conventions.

## Quality Bar
- Always implement the best long-term design you can justify; do not ship stopgaps, throw-aways, or "temporary" workarounds.
- Do not preserve backward compatibility for legacy data or APIs unless explicitly requested.
- Optimize for clarity, maintainability, performance over minimizing churn.
- When adding a component, build it as if it will stay.
- Complexity is a demon we must fight with
- Best code is no code
- Simplicity is the key
- The only thing worse than no documentation is wrong or outdated documentation
