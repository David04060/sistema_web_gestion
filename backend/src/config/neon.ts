/** Identidad mínima obtenida por SQL; no incluye secretos ni datos documentales. */
export interface IdentidadPostgres {
  base_datos: string;
  usuario: string;
  version: string;
  rama: string | null;
}

/** Solo admite conexión directa y certificado verificado del usuario de aplicación. */
export function validarUrlNeon(
  valor: string,
  hostEsperado?: string,
  usuarioEsperado = 'sistema_web_app',
  baseEsperada = 'neondb',
): boolean {
  try {
    const url = new URL(valor);
    return (
      ['postgres:', 'postgresql:'].includes(url.protocol) &&
      decodeURIComponent(url.username) === usuarioEsperado &&
      /^[a-z][a-z0-9_]{0,62}$/.test(baseEsperada) &&
      url.pathname === '/' + baseEsperada &&
      url.hostname.endsWith('.neon.tech') &&
      !url.hostname.includes('-pooler') &&
      (!hostEsperado || url.hostname === hostEsperado) &&
      url.searchParams.get('sslmode') === 'verify-full' &&
      !['sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat'].some((k) => url.searchParams.has(k))
    );
  } catch {
    return false;
  }
}

/** Rechaza la sesión antes de consultar datos si la identidad o TLS son inesperados. */
export function validarIdentidadPostgres(
  identidad: IdentidadPostgres | undefined,
  tls: boolean,
  neon: boolean,
  ramaEsperada?: string,
  usuarioEsperado = 'sistema_web_app',
  baseEsperada = neon ? 'neondb' : 'sistema_web_final',
): void {
  if (
    !identidad ||
    identidad.base_datos !== baseEsperada ||
    (neon && (identidad.usuario !== usuarioEsperado || !tls)) ||
    (neon && ramaEsperada !== undefined && identidad.rama !== ramaEsperada)
  ) {
    throw new Error('Identidad PostgreSQL o TLS no corresponden a la configuración autorizada.');
  }
}
