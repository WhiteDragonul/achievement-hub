import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

// Constrângerile sunt verificate de baza de date (UNIQUE, FK, CHECK, NOT NULL), nu duplicate în cod.
// Aici traducem erorile Postgres în răspunsuri HTTP. Codurile sunt SQLSTATE standard.
const PG_ERRORS: Record<string, { status: number; message: string }> = {
  '23505': { status: 409, message: 'Există deja o înregistrare cu aceste valori unice' }, // unique_violation
  '23503': { status: 409, message: 'Înregistrarea referită nu există sau este încă folosită' }, // foreign_key_violation
  '23001': { status: 409, message: 'Înregistrarea este încă folosită și nu poate fi ștearsă' }, // restrict_violation (ON DELETE RESTRICT)
  '23514': { status: 400, message: 'Valoare invalidă (încalcă o constrângere CHECK)' }, // check_violation
  '23502': { status: 400, message: 'Lipsește o valoare obligatorie' }, // not_null_violation
  '22P02': { status: 400, message: 'Format de valoare invalid' }, // invalid_text_representation
  '22007': { status: 400, message: 'Dată invalidă' }, // invalid_datetime_format
};

type PgError = FastifyError & { constraint?: string };

export function errorHandler(error: PgError, request: FastifyRequest, reply: FastifyReply) {
  // Cererea nu respectă schema JSON a rutei.
  if (error.validation) {
    return reply.status(400).send({ error: 'Date invalide', details: error.message });
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
  return reply.status(500).send({ error: 'Eroare internă' });
}
