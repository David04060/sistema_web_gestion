/** Archivo: Genera y comprueba una huella de contraseña; nunca necesita guardar la contraseña original.
 */
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
/** Calcula la huella scrypt sin bloquear la atención de otras solicitudes. */
function derivarClave(contrasena: string, sal: Buffer, longitud: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      contrasena,
      sal,
      longitud,
      {
        N,
        r: R,
        p: P,
        maxmem: 32 * 1024 * 1024,
      },
      (error, claveDerivada) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(claveDerivada);
      },
    );
  });
}
/**
 * Comprueba que la huella guardada tiene el formato conocido y calcula la de la contraseña recibida.
 * Compara ambas sin terminar antes al encontrar una diferencia, para no revelar dónde coinciden.
 */
export async function verificarContrasena(contrasena: string, hashGuardado: string): Promise<boolean> {
  const partes = hashGuardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') {
    return false;
  }
  const [, n, r, p, salHex, hashHex] = partes;
  if (
    n !== String(N) ||
    r !== String(R) ||
    p !== String(P) ||
    !/^[0-9a-f]{32}$/i.test(salHex) ||
    !/^[0-9a-f]{128}$/i.test(hashHex)
  ) {
    return false;
  }
  const sal = Buffer.from(salHex, 'hex');
  const hashOriginal = Buffer.from(hashHex, 'hex');
  const hashCalculado = await derivarClave(contrasena, sal, hashOriginal.length);
  return timingSafeEqual(hashOriginal, hashCalculado);
}
/** Genera el formato scrypt existente con sal aleatoria de 16 bytes; no persiste datos. */
export async function generarHash(contrasena: string): Promise<string> {
  if (contrasena.length < 8) {
    throw new Error('La contraseña debe tener mínimo 8 caracteres');
  }
  const sal = randomBytes(16);
  const hash = await derivarClave(contrasena, sal, KEY_LENGTH);
  return ['scrypt', N, R, P, sal.toString('hex'), hash.toString('hex')].join('$');
}
