# shadcn is a generator, not a dependency

Phase 5 needs a component layer, and a design language already existed before any component did:
Cobalt & Cream, with a measured contrast table in `docs/design-system.md`. shadcn/ui was chosen
because its output is source code in this repo rather than a package with opinions — which is the
only reason the reconciliation below is possible at all.

The question that decided everything else: **which vocabulary adapts to which?** shadcn components
are written against `bg-primary`, `text-muted-foreground`, `border-border`. The design system had
`bg-ground`, `text-ink`, `border-edge`. Two of those names collide outright — shadcn's `accent` is
a subtle hover fill where the design system's is the cobalt CTA, and shadcn's `muted` is a
background where the design system's was secondary text.

## shadcn's names win, in one place

`@theme inline` in `client/src/index.css` publishes the palette under shadcn's names. The `:root`
block keeps the design system's names and remains the only place a colour is written down.

The alternative — rewriting each component's classes to `bg-accent` / `text-ink` on arrival — was
rejected because it makes every future `shadcn add` a manual translation, forever, with a silent
failure mode when one class is missed.

The payoff is that the rule `docs/design-system.md` calls out as easy to get wrong enforces itself:

```css
--color-primary-foreground: var(--accent-ink);
```

A generated component asking for `text-primary-foreground` gets `#ffffff` in light mode and
`#121316` in dark, because that is what the token says. It cannot ask for white.

This is not theoretical. The generated `button.tsx` and `badge.tsx` both shipped
`bg-destructive text-white`, which measures 2.79:1 against the dark-mode red and fails AA — the
exact bug the design doc warns about, arriving pre-written on the first install.

## The trade this makes

The names cross over, and that is genuinely confusing to read: the design system's `accent` is
shadcn's `primary`, while shadcn's `accent` is the design system's `accent-soft`. Anyone writing
raw `var(--accent)` in a stylesheet gets the cobalt, while `bg-accent` gives the soft tint. The
comment in `index.css` is load-bearing for that reason.

Accepted because the crossover is confined to one file that is read deliberately, whereas the
alternative spreads a translation step across every component that will ever be added.

## No `.dark` class

shadcn's Tailwind v4 template ships `@custom-variant dark (&:is(.dark *))`, redefining `dark:` as
class-based. It is not adopted. This project has no theme provider and no toggle: the whole page
follows `prefers-color-scheme`, and leaving `dark:` at Tailwind's media-query default is what makes
the `dark:` utilities inside a generated component resolve correctly here. Adding the variant
without also adding a `.dark` class would make every one of them dead code that silently never
applies.

`sonner.tsx` was generated against `next-themes` for the same reason and had it removed: with no
provider, the answer is always `system`, and a dependency that computes a constant is not one.

## One focus treatment

`index.css` declares a `:focus-visible` outline in the base layer, because keyboard-only booking is
a Phase 11 acceptance criterion and a component must not be able to forget it. shadcn components
bring their own `focus-visible:ring-[3px]` plus `outline-none` to make room for it.

Both are stripped on arrival. `outline-none` is the important one: it lands in the utilities layer,
which Tailwind orders *after* base, so a generated `<Button>` would have silently disabled the
project's only focus indicator — passing every type check and every render test on the way.

The one exception is `calendar.tsx`, whose dropdown wrapper keeps `has-focus:ring-*`. The element
actually receiving focus there is a `<select>` at `opacity-0`, so the global outline would draw on
something invisible.

## A second colour, for one job

The design system says one accent, and that status is carried by words rather than by a colour that
appears nowhere else. `destructive` is its one exception: cancelling a medical appointment is a
real destructive action, Phase 6 builds it, and shadcn's Button and Alert already have the variant.

`--danger` is `#b3261e` light and `#ff6b5e` dark, measured the same way as the rest of the table.
`--danger-ink` is dark in dark mode for exactly the reason `--accent-ink` is.

## Consequences

Radius folds: Tailwind's `sm`/`md` map to 8px and `lg`/`xl` to 12px, so shadcn's `rounded-md` and
`rounded-lg` land on the two steps the design system already had. Two spellings for one value set,
which is the cheaper half of the trade.

`button.tsx` still needs two hand-edits no token can express — `rounded-pill` and `font-display` —
because "buttons are pills set in display type" is a composition decision, not a colour.

`client/src/components/ui/ui-invariants.test.ts` asserts all of the above against the files
themselves rather than a rendered tree, because the regression path is `shadcn add --overwrite`
putting the generator's version back. Falsified by doing exactly that: regenerating `button.tsx`
from the registry turns five of them red.

`@/` is aliased in three places that must agree — `tsconfig.json`, `vite.config.ts` and
`vitest.config.ts`. The last is a separate file from the first two and is the one that gets
forgotten; the symptom is tests failing to resolve imports that build fine.
