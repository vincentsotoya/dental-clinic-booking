import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CatalogueService } from '@dental/shared'
import { ChooseService } from './ChooseService'

// Rendered directly rather than driven through `Book`: the ordering and the two
// doors are this component's own decisions, and the flow's tests would only
// reach them through a stubbed catalogue that hid what is being asserted.

afterEach(cleanup)

function service(slug: string, name: string, providerType: 'DENTIST' | 'HYGIENIST') {
  return {
    id: `id-${slug}`,
    slug,
    name,
    description: null,
    durationMins: 30,
    priceCents: 8_500,
    providerType,
  } as CatalogueService
}

// The catalogue answers alphabetically within each type, which is what put
// Child Cleaning first and Emergency Toothache Visit sixth.
const CATALOGUE = [
  service('composite-filling', 'Composite Filling', 'DENTIST'),
  service('crown-preparation', 'Crown Preparation', 'DENTIST'),
  service('emergency-visit', 'Emergency Toothache Visit', 'DENTIST'),
  service('new-patient-exam', 'New Patient Exam & X-rays', 'DENTIST'),
  service('root-canal', 'Root Canal (single canal)', 'DENTIST'),
  service('routine-exam', 'Routine Exam', 'DENTIST'),
  service('tooth-extraction', 'Tooth Extraction (simple)', 'DENTIST'),
  service('child-cleaning', 'Child Cleaning', 'HYGIENIST'),
  service('deep-cleaning', 'Deep Cleaning (per quadrant)', 'HYGIENIST'),
  service('routine-cleaning', 'Routine Cleaning', 'HYGIENIST'),
]

function show(services = CATALOGUE) {
  const onChoose = vi.fn()
  render(<ChooseService services={services} isPending={false} onChoose={onChoose} />)
  return onChoose
}

// The order every card is read in, doors included.
function cardOrder() {
  return screen.getAllByRole('button').map((button) => button.textContent ?? '')
}

describe('the two doors', () => {
  it('offers the emergency visit without reading the list', () => {
    const onChoose = show()

    const door = screen.getByRole('button', { name: /In pain today\?/ })
    door.click()

    expect(onChoose).toHaveBeenCalledWith('emergency-visit')
  })

  it('offers a first visit without asking the patient to name an exam', () => {
    const onChoose = show()

    screen.getByRole('button', { name: /First visit\?/ }).click()

    expect(onChoose).toHaveBeenCalledWith('new-patient-exam')
  })

  it('names the service from the catalogue rather than transcribing it', () => {
    show()

    expect(screen.getByRole('button', { name: /In pain today\?/ }).textContent).toContain(
      'Emergency Toothache Visit',
    )
  })

  // A retired service keeps its row but leaves the catalogue, and a door to one
  // would offer a visit the clinic cannot deliver.
  it('drops a door whose service is not on offer', () => {
    show(CATALOGUE.filter((s) => s.slug !== 'emergency-visit'))

    expect(screen.queryByRole('button', { name: /In pain today\?/ })).toBeNull()
    expect(screen.getByRole('button', { name: /First visit\?/ })).toBeDefined()
  })
})

describe('the order of the list', () => {
  it('does not lead with the treatment that happens to sort first', () => {
    show()

    const cards = cardOrder().filter((text) => !text.includes('?'))
    expect(cards[0]).toContain('Routine Cleaning')
  })

  it('puts the routine work above the invasive work', () => {
    show()

    const order = cardOrder()
    const at = (name: string) => order.findIndex((text) => text.includes(name))

    expect(at('Routine Exam')).toBeLessThan(at('Root Canal'))
    expect(at('Routine Cleaning')).toBeLessThan(at('Child Cleaning'))
  })

  // The list is editorial and the catalogue is not: a treatment added to the
  // clinic and not to the list must still be bookable.
  it('keeps a service the order has never heard of', () => {
    show([...CATALOGUE, service('whitening', 'Teeth Whitening', 'DENTIST')])

    const order = cardOrder()
    expect(order.some((text) => text.includes('Teeth Whitening'))).toBe(true)
    expect(order.at(-1)).toContain('Teeth Whitening')
  })
})

describe('what a card says first', () => {
  it('reads the treatment before what it costs', () => {
    show()

    const card = screen
      .getAllByRole('button')
      .find((button) => button.textContent?.includes('Root Canal'))!

    const text = card.textContent ?? ''
    expect(text.indexOf('Root Canal')).toBeLessThan(text.indexOf('$85'))
  })

  it('carries the duration and the price as one quiet line', () => {
    show()

    expect(screen.getAllByText('30 min in the chair · $85').length).toBeGreaterThan(0)
  })
})
