import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// shadcn components are source, not a dependency, and each one was adapted on
// arrival (ADR-0009). Re-running `shadcn add` overwrites them and silently puts
// all of this back, which is why these are asserted against the files rather
// than against a rendered tree: the damage is in what the class strings say.

const dir = dirname(fileURLToPath(import.meta.url))

const components = readdirSync(dir)
  .filter((file) => file.endsWith('.tsx'))
  .map((file) => [file, readFileSync(join(dir, file), 'utf8')] as const)

describe('generated shadcn components stay adapted', () => {
  it('finds the component directory', () => {
    expect(components.length).toBeGreaterThan(10)
  })

  it.each(components)('%s hardcodes no label colour', (_file, source) => {
    // `text-white` on the destructive variant is 2.79:1 against the dark-mode
    // red. The label colour is always a token, so both modes stay measured.
    expect(source).not.toMatch(/text-white/)
  })

  it.each(components)('%s does not disable the base focus outline', (_file, source) => {
    // These sit in the utilities layer and would beat the `:focus-visible`
    // outline that index.css declares in the base layer.
    expect(source).not.toMatch(/outline-none|outline-hidden/)
  })

  it.each(components)('%s adds no second focus ring', (_file, source) => {
    // calendar's dropdown is the one exception: the focused element there is a
    // `<select>` at opacity-0, so the global outline would draw on nothing.
    const rings = source.match(/(?:focus|focus-visible|has-focus):(?:ring|border-ring)[^\s"']*/g) ?? []
    const allowed = _file === 'calendar.tsx' ? /^has-focus:/ : /^$/
    expect(rings.filter((ring) => !allowed.test(ring))).toEqual([])
  })
})

describe('the button follows the design system', () => {
  const button = components.find(([file]) => file === 'button.tsx')?.[1] ?? ''

  it('is a pill, not the generator default', () => {
    expect(button).toMatch(/rounded-pill/)
    expect(button).not.toMatch(/rounded-md/)
  })

  it('sets its label in display type', () => {
    expect(button).toMatch(/font-display/)
  })
})
