// The one artifact a booking can leave without email (Phase 10).
//
// UTC instants throughout, `startsAt`/`endsAt` as the server sent them — no
// VTIMEZONE block to get wrong, and the reading calendar app converts to
// whatever zone its own device is in, which is the correct behaviour for a
// reminder. `.invalid` is the RFC 2606 domain reserved for exactly this: a UID
// has to be unique, not resolvable, and PRODUCT.md forbids inventing a real one.

import type { PatientAppointment } from '@dental/shared'
import { providerName } from './format'

function icsInstant(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

// Escaping is RFC 5545 §3.3.11: a comma or semicolon would otherwise be read
// as a field or list separator by the calendar app parsing this.
function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')
}

export function appointmentToIcs(appointment: PatientAppointment, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Quillon Dental//Booking//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${appointment.id}@quillondental.invalid`,
    `DTSTAMP:${icsInstant(now.toISOString())}`,
    `DTSTART:${icsInstant(appointment.startsAt)}`,
    `DTEND:${icsInstant(appointment.endsAt)}`,
    `SUMMARY:${icsText(`${appointment.service.name} — Quillon Dental`)}`,
    `LOCATION:${icsText('Quillon Dental')}`,
    `DESCRIPTION:${icsText(`With ${providerName(appointment.provider)}.`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  // CRLF: RFC 5545's line ending, not the platform's.
  return lines.join('\r\n') + '\r\n'
}

/** Triggers the browser's save dialog. No server round trip — the row is already in hand. */
export function downloadIcs(appointment: PatientAppointment): void {
  const blob = new Blob([appointmentToIcs(appointment)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `quillon-dental-${appointment.id}.ics`
  link.click()
  URL.revokeObjectURL(url)
}
