/* global sessionStorage */
import { setTimeout as pausa } from 'node:timers/promises';
import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
/** Mide el build productivo real servido por preview; solo usa cuentas de QA. */
export async function probarRendimiento({ base, usuarios, fase }) {
    const { preview } = await import('../../frontend/node_modules/vite/dist/node/index.js');
    const { chromium } = await import('file:///C:/Users/David/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
    const servidor = await preview({ root: '../frontend', preview: { host: '127.0.0.1', port: 5182, strictPort: true, proxy: { '/api': { target: base, changeOrigin: true } } } });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const resultados = [];
    try {
        const informe = JSON.parse(await readFile(`../docs/optimizacion/bundle-${fase}.json`, 'utf8'));
        const administrativos = informe.chunks.filter(/** Localiza el rol real del catálogo utilizado por el actor o cuenta efímera de esta prueba. */ c => c.modulos.some(/** Localiza el rol real del catálogo utilizado por el actor o cuenta efímera de esta prueba. */ m => /features\/(usuarios|roles|oficinas)\/pages\//.test(m.ruta))).map(/** Asocia la petición observada en Chrome con el recurso del build para medir lo que realmente se descargó. */ c => '/' + c.archivo);
        for (const [perfil, rutas] of [['anonimo', ['/login']], ['origen', ['/dashboard', '/documentos', '/siseve', '/usuarios', ...(fase === 'despues' ? ['/ubicaciones', '/ubicaciones/estantes/nuevo', '/ubicaciones/archivadores/nuevo'] : [])]], ['admin', ['/dashboard', '/usuarios']]]) {
            for (const ruta of rutas) {
                const contexto = await browser.newContext();
                if (perfil !== 'anonimo')
                    await contexto.addInitScript(/** Inyecta únicamente el JWT efímero del actor QA en la pestaña de Chrome antes de cargar la aplicación. */  token => sessionStorage.setItem('documental.jwt', token), usuarios[perfil].token);
                const page = await contexto.newPage();
                const peticiones = [];
                const errores = [];
                page.on('request', /** Gestiona el evento del recurso local de pruebas y solicita su cierre o continuación controlada. */  r => peticiones.push(new URL(r.url()).pathname));
                page.on('pageerror', /** Gestiona el evento del recurso local de pruebas y solicita su cierre o continuación controlada. */  e => errores.push(e.message));
                const inicio = Date.now();
                await page.goto('http://127.0.0.1:5182' + ruta);
                await page.locator('main h1').first().waitFor();
                await page.waitForLoadState('networkidle');
                const http = {};
                for (const p of peticiones.filter(/** Extrae las mediciones de recursos y solicitudes del escenario de navegación para el informe comparativo. */ p => p.startsWith('/api/')))
                    http[p] = (http[p] ?? 0) + 1;
                const js = [...new Set(peticiones.filter(/** Extrae las mediciones de recursos y solicitudes del escenario de navegación para el informe comparativo. */ p => p.endsWith('.js')))];
                const cargados = informe.chunks.filter(/** Asocia la petición observada en Chrome con el recurso del build para medir lo que realmente se descargó. */ c => js.includes('/' + c.archivo));
                const datos = { perfil, ruta, js, js_bytes: cargados.reduce(/** Agrega los tamaños de los recursos realmente solicitados para comparar la descarga de la ruta. */ (s, c) => s + c.bytes, 0), js_gzip: cargados.reduce(/** Agrega los tamaños de los recursos realmente solicitados para comparar la descarga de la ruta. */ (s, c) => s + c.gzip, 0), http, ms_hasta_estable: Date.now() - inicio, errores };
                assert.deepEqual(errores, []);
                if (fase === 'despues' && perfil !== 'admin')
                    assert.ok(!js.some(/** Comprueba la presencia de un módulo o endpoint en las descargas reales del escenario de navegación. */ p => administrativos.includes(p)), `Carga administrativa innecesaria ${perfil} ${ruta}`);
                if (fase === 'despues' && ruta === '/siseve')
                    assert.equal(http['/api/siseve/acceso'], 1);
                if (ruta === '/usuarios' && perfil === 'origen')
                    await page.getByRole('heading', { name: 'Acceso no autorizado', exact: true }).waitFor();
                if (fase === 'despues') {
                    if (ruta === '/ubicaciones')
                        assert.equal(http['/api/ubicaciones/opciones'], undefined);
                    if (ruta === '/ubicaciones/estantes/nuevo') {
                        assert.equal(http['/api/ubicaciones/estantes'], undefined);
                        assert.equal(http['/api/ubicaciones/archivadores'], undefined);
                    }
                    if (ruta === '/ubicaciones/archivadores/nuevo') {
                        assert.equal(http['/api/ubicaciones/opciones'], undefined);
                        assert.equal(http['/api/ubicaciones/archivadores'], undefined);
                    }
                    await page.reload();
                    await page.locator('main h1').first().waitFor();
                    await page.waitForLoadState('networkidle');
                    if (perfil !== 'anonimo')
                        assert.equal(peticiones.filter(/** Extrae las mediciones de recursos y solicitudes del escenario de navegación para el informe comparativo. */ p => p === '/api/auth/me').length, 2, 'Una validación por recarga');
                    datos.recarga = 'aprobada';
                }
                resultados.push(datos);
                await contexto.close();
            }
        }
        if (fase === 'despues') {
            const contexto = await browser.newContext();
            await contexto.addInitScript(/** Inyecta únicamente el JWT efímero del actor QA en la pestaña de Chrome antes de cargar la aplicación. */  token => sessionStorage.setItem('documental.jwt', token), usuarios.admin.token);
            const page = await contexto.newPage();
            await page.goto('http://127.0.0.1:5182/dashboard');
            await page.getByRole('heading', { name: 'Accesos rápidos', exact: true }).waitFor();
            const usuariosChunk = informe.chunks.find(/** Extrae las mediciones de recursos y solicitudes del escenario de navegación para el informe comparativo. */ c => c.modulos.some(/** Extrae las mediciones de recursos y solicitudes del escenario de navegación para el informe comparativo. */ m => m.ruta.endsWith('/usuarios/pages/UsuariosListaPage.tsx')));
            await page.route('**/' + usuariosChunk.archivo, /** Interrumpe deliberadamente la descarga del chunk para comprobar la recuperación de ErrorRuta. */  r => r.abort());
            await page.getByRole('navigation', { name: 'Navegación principal', exact: true }).getByRole('link', { name: 'Usuarios', exact: true }).click();
            await page.getByRole('heading', { name: 'No se pudo cargar la pantalla', exact: true }).waitFor();
            await page.unroute('**/' + usuariosChunk.archivo);
            await page.getByRole('button', { name: 'Recargar pantalla', exact: true }).click();
            await page.getByRole('heading', { name: 'Usuarios', exact: true }).waitFor();
            const rolesChunk = informe.chunks.find(/** Localiza el rol real del catálogo utilizado por el actor o cuenta efímera de esta prueba. */ c => c.modulos.some(/** Localiza el rol real del catálogo utilizado por el actor o cuenta efímera de esta prueba. */ m => m.ruta.endsWith('/roles/pages/RolesPages.tsx')));
            await page.route('**/' + rolesChunk.archivo, /** Retrasa la solicitud interceptada y después la continúa para comprobar el estado visible de carga. */ async (r) => {
                await pausa(1200);
                await r.continue();
            });
            await page.goto('http://127.0.0.1:5182/roles', { waitUntil: 'domcontentloaded' });
            await page.getByRole('navigation', { name: 'Navegación principal', exact: true }).waitFor();
            await page.getByRole('status').filter({ hasText: 'Cargando pantalla' }).waitFor();
            assert.equal(await page.getByRole('navigation', { name: 'Navegación principal', exact: true }).isVisible(), true);
            await page.getByRole('heading', { name: 'Roles', exact: true }).waitFor();
            await page.goto('http://127.0.0.1:5182/dashboard');
            await page.getByRole('heading', { name: 'Accesos rápidos', exact: true }).waitFor();
            await page.keyboard.press('Tab');
            assert.equal(await page.getByRole('link', { name: 'Saltar al contenido', exact: true }).evaluate(/** Comprueba que el elemento esperado haya recibido el foco de teclado. */  e => e === e.ownerDocument.activeElement), true);
            await page.keyboard.press('Enter');
            assert.equal(await page.locator('#contenido-principal').evaluate(/** Comprueba que el elemento esperado haya recibido el foco de teclado. */  e => e === e.ownerDocument.activeElement), true);
            resultados.push({ prueba: 'Chunk abortado y recarga, Suspense mantiene layout y navegación por teclado', resultado: 'aprobado' });
            await contexto.close();
        }
        await writeFile(`../docs/optimizacion/red-${fase}.json`, JSON.stringify(resultados, null, 2));
        console.log('Medición productiva ' + fase + ': ' + resultados.length + ' navegaciones verificadas.');
    }
    finally {
        await browser.close();
        await new Promise(/** Enlaza la finalización asíncrona del recurso o respuesta controlada con la promesa que espera la prueba. */  r => servidor.httpServer.close(r));
    }
}
