// The wire contracts, one module per endpoint. Both apps import from here so
// the server and the client agree by construction rather than by convention.

// `errors` first: it owns the error vocabulary every other module narrows.
export * from './errors'
export * from './health'
export * from './availability'
