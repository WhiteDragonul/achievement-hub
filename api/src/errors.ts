import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

// Constrângerile sunt verificate de baza de date (UNIQUE, FK, CHECK, NOT NULL), nu duplicate în cod.
// Aici traducem erorile Postgres în răspunsuri HTTP. Codurile sunt SQLSTATE standard.
const PG_ERRORS: Record<string, { status: number; message: string }> = {
  '23505': { status: 409, message: 'A record with these unique values already exists' }, // unique_violation
  '23503': { status: 409, message: 'The referenced record does not exist or is still in use' }, // foreign_key_violation
  '23001': { status: 409, message: 'The record is still in use and cannot be deleted' }, // restrict_violation (ON DELETE RESTRICT)
  '23514': { status: 400, message: 'Invalid value (violates a CHECK constraint)' }, // check_violation
  '23502': { status: 400, message: 'A required value is missing' }, // not_null_violation
  '22P02': { status: 400, message: 'Invalid value format' }, // invalid_text_representation
  '22007': { status: 400, message: 'Invalid date' }, // invalid_datetime_format
};

type PgError = FastifyError & { constraint?: string };

export function errorHandler(error: PgError, request: FastifyRequest, reply: FastifyReply) {
  // Cererea nu respectă schema JSON a rutei.
  if (error.validation) {
    return reply.status(400).send({ error: 'Invalid data', details: error.message });
  }

  const pgError = error.code ? PG_ERRORS[error.code] : undefined;
  if (pgError) {
    // Numele constrângerii (ex. users_username_lower_uq) spune exact ce regulă a fost încălcată.
    return reply.status(pgError.status).send({ error: pgError.message, constraint: error.constraint });
  }

  // Erori 4xx aruncate de Fastify însuși (ex. JSON malformat): mesajul lor e util clientului.
  if (error.statusCode && error.statusCode < 500) {
    return reply.status(error.statusCode).send({ error: error.message });
  }

  request.log.error(error);
  return reply.status(500).send({ error: 'Internal error' });
}
