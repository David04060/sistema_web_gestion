/* global sessionStorage, document, innerWidth */
import assert from 'node:assert/strict';
import { setTimeout as pausa } from 'node:timers/promises';
import { mkdir } from 'node:fs/promises';
/** Navegación real contra Express y PostgreSQL QA; ningún dato simulado en producción. */
export async function verificarNavegador({ base, usuarios }) {
    const { chromium } = await import('file:///C:/Users/David/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
    const { createServer } = await import('../../frontend/node_modules/vite/dist/node/index.js');
    const vite = await createServer({ root: '../frontend', server: { host: '127.0.0.1', port: 5178, strictPort: true, proxy: { '/api': { target: base, changeOrigin: true } } } });
    let browser;
    try {
        await vite.listen();
        browser = await chromium.launch({ headless: true, channel: 'chrome' });
        await mkdir('.private/dashboard', { recursive: true });
        for (const [rol, u] of Object.entries(usuarios)) {
            const contexto = await browser.newContext();
            await contexto.addInitScript(/** Inyecta únicamente el JWT efímero del actor QA en la pestaña de Chrome antes de cargar la aplicación. */  token => sessionStorage.setItem('documental.jwt', token), u.token);
            const page = await contexto.newPage();
            const errores = [];
            page.on('pageerror', /** Gestiona el evento del recurso local de pruebas y solicita su cierre o continuación controlada. */  e => errores.push(e.message));
            for (const width of [1440, 390]) {
                await page.setViewportSize({ width, height: 1000 });
                await page.goto('http://127.0.0.1:5178/dashboard');
                await page.getByRole('heading', { name: 'Accesos rápidos', exact: true }).waitFor();
                assert.equal(await page.evaluate(/** Detecta desbordamiento horizontal comparando el documento con el ancho real del viewport. */ () => document.documentElement.scrollWidth > innerWidth), false, `${rol}: desborde ${width}`);
                assert.equal(await page.getByRole('alert').count(), 0);
                await page.screenshot({ path: `.private/dashboard/${rol}-${width}.png`, fullPage: true });
            }
            const enlaces = await page.locator('nav[aria-label="Accesos rápidos"] a').evaluateAll(/** Extrae destinos de los accesos rápidos para comprobar que respeten el rol del actor QA. */  as => as.map(/** Transforma cada entrada de as para construir los datos que comprueba este escenario. */ /** Obtiene destinos o nombres accesibles de elementos reales para contrastar la navegación del rol. */ a => a.getAttribute('href')));
            for (const ruta of enlaces) {
                await page.goto('http://127.0.0.1:5178' + ruta);
                await page.locator('main h1').first().waitFor();
                assert.equal(await page.getByRole('heading', { name: /Página no encontrada/ }).count(), 0);
            }
            await page.goto('http://127.0.0.1:5178/dashboard');
            await page.getByRole('heading', { name: 'Accesos rápidos', exact: true }).waitFor();
            await page.route('**/api/dashboard', /** Retrasa la solicitud interceptada y después la continúa para comprobar el estado visible de carga. */ async (r) => {
                await pausa(500);
                await r.continue();
            });
            await page.getByRole('button', { name: 'Actualizar panel' }).click();
            await page.getByRole('status').filter({ hasText: 'Consultando indicadores' }).waitFor();
            await page.getByRole('heading', { name: 'Accesos rápidos', exact: true }).waitFor();
            await page.unroute('**/api/dashboard');
            await page.route('**/api/dashboard', /** Devuelve un error HTTP controlado para comprobar que la interfaz presente un mensaje público seguro. */  r => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'SQL privado' }) }));
            await page.getByRole('button', { name: 'Actualizar panel' }).click();
            await page.getByRole('alert').waitFor();
            assert.ok(!(await page.getByRole('alert').innerText()).includes('SQL privado'));
            await page.unroute('**/api/dashboard');
            await page.getByRole('button', { name: 'Reintentar' }).click();
            await page.getByRole('heading', { name: 'Accesos rápidos', exact: true }).waitFor();
            assert.deepEqual(errores, []);
            await contexto.close();
        }
        console.log('QA navegador: cuatro perfiles, 1440/390px, accesos, error 500 y reintento aprobados.');
    }
    finally {
        if (browser)
            await browser.close();
        await vite.close();
    }
}
