// Proves the public catalogue against real rows.
//
// Run with `npm run db:catalogue --workspace=@dental/server` after a seed.
//
// The route tests assert the handler *asks* for active rows. Only Postgres can
// show what that clause does: a service is retired here, the endpoint is asked
// again, and the treatment has to be gone. Drop `where: { isActive: true }` and
// these checks turn red — which is the only reason they exist.
//
// Every row it touches is restored before it exits.

import type { Server } from 'node:http'
import type { ProvidersResponse, ServicesResponse } from '@dental/shared'
import { providersResponse, servicesResponse } from '@dental/shared'
import { createApp } from '../src/app'
import { auth } from '../src/auth'
import { databaseIsReachable, prisma } from '../src/db'
import { env } from '../src/env'

let failures = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

async function main(): Promise<void> {
  const app = createApp({
    db: prisma,
    auth,
    databaseIsReachable,
    timeZone: env.CLINIC_TIMEZONE,
  })

  const server: Server = await new Promise((resolve) => {
    const listening = app.listen(0, () => resolve(listening))
  })
  const port = (server.address() as { port: number }).port
  const base = `http://127.0.0.1:${port}`

  const getServices = async () => {
    const res = await fetch(`${base}/api/services`)
    return {
      status: res.status,
      cacheControl: res.headers.get('cache-control'),
      body: servicesResponse.parse(await res.json()) as ServicesResponse,
    }
  }
  const getProviders = async () => {
    const res = await fetch(`${base}/api/providers`)
    return {
      status: res.status,
      cacheControl: res.headers.get('cache-control'),
      body: providersResponse.parse(await res.json()) as ProvidersResponse,
    }
  }

  // Restored in `finally`, whatever happens in between.
  let retiredService: string | null = null
  let retiredProvider: string | null = null

  try {
    // --- The catalogue as seeded -------------------------------------------
    console.log('\nGET /api/services')
    const services = await getServices()
    check('200, and the body parses as its contract', services.status === 200)
    check('all ten seeded services are offered', services.body.services.length === 10,
      `${services.body.services.length} services`)
    check('publicly cacheable', services.cacheControl === 'public, max-age=300',
      String(services.cacheControl))

    // The buffer is a real column on every one of these rows. Its absence here
    // is the `select` doing its job against live data, not against a fixture.
    const leaked = services.body.services.filter((s) => 'bufferMins' in s || 'isActive' in s)
    check('no operational columns on the wire', leaked.length === 0, `${leaked.length} leaked`)

    const types = services.body.services.map((s) => s.providerType)
    check('dentist services sort before hygienist ones',
      types.indexOf('HYGIENIST') === -1 || types.lastIndexOf('DENTIST') < types.indexOf('HYGIENIST'))

    const priced = services.body.services.filter((s) => s.priceCents > 0)
    check('every service carries a list price', priced.length === services.body.services.length)

    console.log('\nGET /api/providers')
    const providers = await getProviders()
    check('200, and the body parses as its contract', providers.status === 200)
    check('all five seeded providers are listed', providers.body.providers.length === 5,
      `${providers.body.providers.length} providers`)
    const surnames = providers.body.providers.map((p) => `${p.type[0]}:${p.lastName}`)
    check('dentists first, alphabetical within each',
      JSON.stringify(surnames) ===
        JSON.stringify(['D:Osei', 'D:Raman', 'D:Reyes', 'H:Clarke', 'H:Vela']),
      surnames.join(' '))

    // --- Retiring a service, for real --------------------------------------
    console.log('\nA retired service leaves the catalogue')
    const victim = services.body.services.find((s) => s.slug === 'root-canal')
    if (!victim) throw new Error('seed is missing root-canal')

    await prisma.service.update({ where: { id: victim.id }, data: { isActive: false } })
    retiredService = victim.id

    const afterRetire = await getServices()
    check('the retired treatment is gone',
      !afterRetire.body.services.some((s) => s.slug === 'root-canal'))
    check('and the rest are untouched', afterRetire.body.services.length === 9,
      `${afterRetire.body.services.length} services`)

    await prisma.service.update({ where: { id: victim.id }, data: { isActive: true } })
    retiredService = null

    const afterRestore = await getServices()
    check('restoring it puts the treatment back',
      afterRestore.body.services.some((s) => s.slug === 'root-canal'))

    // --- A provider who has left -------------------------------------------
    console.log('\nA provider who has left leaves the directory')
    const leaver = providers.body.providers.find((p) => p.lastName === 'Vela')
    if (!leaver) throw new Error('seed is missing Vela')

    await prisma.provider.update({ where: { id: leaver.id }, data: { isActive: false } })
    retiredProvider = leaver.id

    const afterLeave = await getProviders()
    check('the departed provider is gone',
      !afterLeave.body.providers.some((p) => p.lastName === 'Vela'))

    // The row survives because appointments reference it. Hiding is not deleting.
    const stillThere = await prisma.provider.findUnique({ where: { id: leaver.id } })
    check('their row still exists, merely inactive', stillThere?.isActive === false)

    await prisma.provider.update({ where: { id: leaver.id }, data: { isActive: true } })
    retiredProvider = null
    check('restoring them puts the provider back',
      (await getProviders()).body.providers.some((p) => p.lastName === 'Vela'))
  } finally {
    if (retiredService) {
      await prisma.service.update({ where: { id: retiredService }, data: { isActive: true } })
    }
    if (retiredProvider) {
      await prisma.provider.update({ where: { id: retiredProvider }, data: { isActive: true } })
    }
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} FAILED.`}`)
  if (failures > 0) process.exitCode = 1
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
