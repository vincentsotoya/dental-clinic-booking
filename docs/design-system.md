# Design system

Facts that must hold when a component is written. The tokens themselves live in
`client/src/index.css`; this file is why they are what they are.

Settled in a `/design-taste-frontend` session at the start of Phase 5, before any component existed.

## The read

A consumer healthcare booking product for patients who are, on average, slightly anxious about
being here at all. Healthcare is a trust-first constraint, and it outranks aesthetic preference:
the measure of this interface is whether a nervous person can book on a phone, one-handed, and a
keyboard-only person can do the same. Phase 11 turns that into acceptance criteria (Lighthouse
≥ 95, keyboard-only booking), so the tokens are built for it now rather than retrofitted.

**Dials:** variance 5, motion 3, density 4. Not the skill's 8/6/4 baseline.

## Cobalt on cream, and why not teal

Every dental practice on the first page of a search is teal or mint. Adopting it would make this
site invisible in exactly the market it depicts. Cobalt reads clinical and trustworthy, is not the
default, and holds contrast on both grounds.

The ground is a warm off-white rather than pure white: `#ffffff` under a full-page medical form is
clinical in the bad sense, and pure white also removes the one surface that can lift a card off
the page.

These are the values. The utilities you actually write are shadcn's names, because that is what
every component is generated against — see ADR-0009 for why the adapter runs in that direction.

| Token | Light | Dark | Job | Written as |
|---|---|---|---|---|
| `ground` | `#fbf9f6` | `#121316` | The page | `bg-background` |
| `surface` | `#ffffff` | `#1a1c20` | Cards, lifted off the ground | `bg-card`, `bg-popover` |
| `ink` | `#17191c` | `#f2f0ec` | Body and headings | `text-foreground` |
| `muted` | `#6b7076` | `#a0a4aa` | Secondary text | `text-muted-foreground` |
| `accent` | `#1b45d8` | `#5b7cff` | CTAs, focus rings, the selected slot | `bg-primary`, `ring-ring` |
| `accent-ink` | `#ffffff` | `#121316` | The label *on* the accent | `text-primary-foreground` |
| `accent-soft` | `#e8ecfd` | `#1c2440` | A selected slot's fill. Not a second accent | `bg-accent` |
| `edge` | `#e7e2db` | `#2a2d33` | Hairlines, input borders, subtle fills | `border-border`, `bg-muted` |
| `danger` | `#b3261e` | `#ff6b5e` | Destructive actions only — see below | `bg-destructive` |
| `danger-ink` | `#ffffff` | `#121316` | The label *on* danger | `text-destructive-foreground` |

**The names cross over, and it catches people.** The design system's `accent` is written
`bg-primary`; shadcn's `bg-accent` is this table's `accent-soft`. Raw `var(--accent)` in a
stylesheet is still the cobalt.

Measured, not assumed:

| Pair | Ratio | Needs |
|---|---|---|
| `ink` on `ground` (light) | 16.76:1 | 4.5 |
| `muted` on `ground` (light) | 4.75:1 | 4.5 |
| `accent` as link text on `ground` (light) | 6.92:1 | 4.5 |
| `accent-ink` on `accent` (light) | 7.27:1 | 4.5 |
| `ink` on `ground` (dark) | 16.32:1 | 4.5 |
| `muted` on `ground` (dark) | 7.42:1 | 4.5 |
| `accent` as link text on `ground` (dark) | 5.11:1 | 4.5 |
| `accent-ink` on `accent` (dark) | 5.11:1 | 4.5 |
| `danger` on `ground` (light) | 6.22:1 | 4.5 |
| `danger-ink` on `danger` (light) | 6.54:1 | 4.5 |
| `danger` on `ground` (dark) | 6.65:1 | 4.5 |
| `danger-ink` on `danger` (dark) | 6.65:1 | 4.5 |

**The rule that is easy to get wrong:** the primary button's label is dark in dark mode. White on
lifted cobalt is 3.64:1 and fails AA. That is why the token is `accent-ink` and never `white` —
a component that hardcodes `text-white` on a cobalt button is correct in one mode and broken in
the other, and nothing in the type system would object.

The same trap holds for `danger`: white on the dark-mode red is 2.79:1. Routing shadcn's own
`text-primary-foreground` and `text-destructive-foreground` through these tokens is what makes
both automatic — and it was not academic. The generated `button.tsx` and `badge.tsx` arrived
with `bg-destructive text-white` already written. `ui-invariants.test.ts` now fails if it
comes back.

`muted` at 4.75:1 has almost no headroom. Anything smaller than body size uses `ink`, not `muted`.

## One accent, one radius, one theme

- **One accent, and one exception.** No second colour arrives for a success state or a badge —
  status is carried by words and icon, not by a green that appears nowhere else on the site. The
  exception is `danger`, and only for destructive actions: cancelling an appointment is a real
  one, and Phase 6 builds it. Nothing else may reach for it.
- **One radius scale:** `card` 12px, `input` 8px, `pill` for buttons. Nothing else.

  Use the generated utilities — `rounded-card`, `rounded-input`, `rounded-pill` — not an arbitrary
  value. Tailwind v4 builds them from the `--radius-*` tokens, and the v3 spelling
  `rounded-[--radius-card]` silently compiles to `border-radius: --radius-card`, which is invalid
  CSS: the corner renders square and nothing warns. The same applies to every token namespace here.

  Tailwind's own scale is folded onto two of those steps — `sm`/`md` to 8px, `lg`/`xl` to
  12px — so a generated component's `rounded-md` lands on `input` and its `rounded-lg` on
  `card`. Buttons are the one thing no token can express, and `button.tsx` is hand-edited to
  `rounded-pill` on arrival.
- **One theme per page.** The whole page is light or the whole page is dark, following
  `prefers-color-scheme`. No section inverts.

## Type

**Outfit Variable** for display, **Geist Variable** for body and UI. Both self-hosted through
npm — no `<link>` to a font CDN in production, and Vite subsets them per script.

Cabinet Grotesk was the first choice and was dropped: it is Fontshare-only, so it ships either as
a hand-committed binary or as the CDN `<link>` this rules out. Outfit is the nearest thing in the
same geometric family that survives that constraint.

Display type is tracked tight (`-0.02em`); body is not tracked at all. Body copy caps at `65ch`.

## Motion

Motion 3: transitions are **feedback**, never decoration. A hover state, a `:active` press of
`translate-y-[1px]`, a route fade. Nothing loops, nothing parallaxes, nothing hijacks a scroll.

Two reasons, and only one of them is taste. A booking flow is a task a patient wants to finish,
and motion that delays a task is a tax on it. The other is Phase 11's Lighthouse target, which
animation of the interesting kind makes materially harder.

`prefers-reduced-motion` is honoured globally in `index.css`, so a component cannot forget it.

## Focus is declared once

The `:focus-visible` outline in `index.css` is the only focus treatment on the site. Generated
components arrive with their own `focus-visible:ring-[3px]` and an `outline-none` to clear room
for it; both are stripped on arrival.

`outline-none` is the dangerous one. It lands in Tailwind's utilities layer, which is ordered
after base, so a component carrying it silently disables the project's only focus indicator while
passing every type check. The single exception is `calendar.tsx`'s dropdown, where the focused
element is a `<select>` at `opacity-0` and the outline would draw on nothing.

## What this file does not cover

The skill that produced this covers marketing surfaces. It explicitly excludes multi-step wizards
and dense product UI, which is half of Phase 5:

| Surface | Governed by |
|---|---|
| Home, Services, Dentists | This file, in full |
| Signup, login | These tokens; form patterns from the skill's §4.6 |
| Booking flow, my appointments | These tokens **only**. Interaction patterns are an open question |

The booking flow inherits every token here and none of the composition advice. Deciding how
picking a slot actually feels is its own session, before those components are written.

What it *does* now inherit is a set of primitives: shadcn/ui, generated into
`client/src/components/ui/` and adapted to these tokens on arrival (ADR-0009). Those settle what a
button and an input look like. They settle nothing about how a wizard is composed.
