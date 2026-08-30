// The wire contracts, one module per endpoint. Both apps import from here so
// the server and the client agree by construction rather than by convention.

export * from './health'
export * from './availability'
