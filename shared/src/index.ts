// The wire contracts, one module per endpoint. Both apps import from here so
// the server and the client agree by construction rather than by convention.

// `errors` and `roles` first: they own vocabulary the endpoint modules narrow.
export * from './errors'
export * from './roles'
export * from './health'
export * from './availability'
export * from './me'
export * from './appointments'
