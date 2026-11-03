import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
const ALGORITMO = 'HS256';
const EMISOR = 'sistema-web-documental';
const AUDIENCIA = 'sistema-web-documental-api';
/** Sesión de una hora para todos los roles; fuente única para la firma y expiresIn. */
export const TOKEN_DURACION_SEGUNDOS = 3600;
export interface JwtPayload {
  sub: string;
  version: number;
}
/** Firma exclusivamente HS256; no incluye datos personales ni hashes de contraseña. */
export function generarToken(usuarioId: string, version: number): string {
  return jwt.sign({ version }, env.JWT_SECRET, {
    algorithm: ALGORITMO,
    subject: usuarioId,
    issuer: EMISOR,
    audience: AUDIENCIA,
    expiresIn: TOKEN_DURACION_SEGUNDOS,
    jwtid: randomUUID(),
  });
}
/** Verifica firma, emisor, audiencia y vencimiento, y limita sub al bigint positivo de PostgreSQL. */
export function verificarToken(token: string): JwtPayload {
  const payload = jwt.verify(token, env.JWT_SECRET, {
    algorithms: [ALGORITMO],
    issuer: EMISOR,
    audience: AUDIENCIA,
    clockTolerance: 5,
  });
  if (
    typeof payload === 'string' ||
    typeof payload.sub !== 'string' ||
    !/^[1-9][0-9]{0,18}$/.test(payload.sub) ||
    BigInt(payload.sub) > 9223372036854775807n ||
    !Number.isSafeInteger(payload.exp) ||
    !Number.isSafeInteger(payload.version) ||
    payload.version < 0
  ) {
    throw new Error('Token inválido');
  }
  return {
    sub: payload.sub,
    version: payload.version,
  };
}
