/** Archivo: Comprueba el resultado real de Vite: pantallas diferidas y ausencia de circuitos retirados.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
/** Verifica el grafo generado, no la forma textual de los imports de React. */
test('El build deja las pantallas administrativas fuera de la descarga inicial', async () => {
  const resultado = await build({ logLevel: 'silent', build: { write: false } });
  const chunks = (Array.isArray(resultado) ? resultado : [resultado])
    .flatMap((r) => r.output)
    .filter((c) => c.type === 'chunk');
  const inicial = chunks.find((c) => c.isEntry);
  assert.ok(inicial);
  const porArchivo = new Map(chunks.map((c) => [c.fileName, c]));
  const visitados = new Set();
  /**
   * Recorre los imports estáticos del bundle evitando ciclos para identificar lo que se descarga en la
   * entrada inicial.
   */
  function recorrer(nombre) {
    if (visitados.has(nombre)) return;
    visitados.add(nombre);
    for (const i of porArchivo.get(nombre)?.imports ?? []) recorrer(i);
  }
  recorrer(inicial.fileName);
  const modulosIniciales = [...visitados]
    .flatMap(
      /**
       * Identifica módulos de pantallas en el grafo generado para comprobar que no entren en la descarga
       * inicial sin autorización de ruta.
       */ (n) => Object.keys(porArchivo.get(n)?.modules ?? {}),
    )
    .map((n) => n.replaceAll('\\', '/'));
  for (const modulo of ['usuarios', 'documentos', 'ubicaciones']) {
    assert.ok(
      !modulosIniciales.some(
        /**
         * Identifica módulos de pantallas en el grafo generado para comprobar que no entren en la descarga
         * inicial sin autorización de ruta.
         */ (n) => n.includes(`/features/${modulo}/pages/`),
      ),
      `${modulo} cargado anticipadamente`,
    );
    assert.ok(
      chunks.some((c) =>
        Object.keys(c.modules).some((n) => n.replaceAll('\\', '/').includes(`/features/${modulo}/pages/`)),
      ),
      `${modulo} no emitido`,
    );
  }
  assert.ok(Buffer.byteLength(inicial.code) < 500000, 'El chunk de entrada vuelve a superar 500 kB');
  const codigoActivo = chunks.map((c) => c.code).join('\n');
  assert.ok(
    !codigoActivo.includes('Registrar documento recibido') &&
      !codigoActivo.includes('Registrar documento emitido'),
    'El build conserva entradas duplicadas de registro',
  );
  assert.ok(codigoActivo.includes('Registrar documento'), 'Falta el acceso único de registro');
  const activos = chunks.flatMap((c) => Object.keys(c.modules)).map((n) => n.replaceAll('\\', '/'));
  assert.ok(
    !activos.some((n) => n.includes('/features/siseve/') || n.includes('/features/movimientos/')),
    'Circuito retirado presente en el build activo',
  );
  assert.ok(
    chunks.some((c) => c.isDynamicEntry),
    'No hay división dinámica',
  );
});
