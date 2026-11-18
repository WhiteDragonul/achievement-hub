// Scheme JSON refolosite de toate rutele. Fastify validează automat params / querystring / body după ele
// și răspunde 400 dacă cererea nu se potrivește, înainte ca handler-ul să ruleze.
// Querystring-ul vine ca text; Fastify îl convertește în integer/boolean conform schemei.

export const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;
export type IdParams = { id: number };

// Paginare simplă cu LIMIT / OFFSET. Răspunsul e doar lista; dacă are `limit` elemente, probabil mai există o pagină.
export const paginationProperties = {
  limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  offset: { type: 'integer', minimum: 0, default: 0 },
} as const;
export type Pagination = { limit: number; offset: number };

export const notFound = (what: string) => ({ error: `${what} does not exist` });
