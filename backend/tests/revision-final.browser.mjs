import { revisarContraste } from './accesibilidad-browser.mjs';
/* global document, innerWidth, window */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
/** Chrome real y Vite con proxy a Express QA; no se reemplazan datos del API. */
export async function probarNavegadorIntegral({ base, usuarios, clave, roles, oficinas, tipos, documento, movimiento, req }) {
    const { chromium } = await import('file:///C:/Users/David/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
    const { preview } = await import('../../frontend/node_modules/vite/dist/node/index.js');
    const vite = await preview({ root: '../frontend', preview: { host: '127.0.0.1', port: 5181, strictPort: true, proxy: { '/api': { target: base, changeOrigin: true } } } });
    const url = 'http://127.0.0.1:5181';
    let browser;
    const errores = [], pantallas = [], flujos = [], contrastes = [];
    /** Registra el evento o fixture del entorno de pruebas en su colección o conexión local; no utiliza información institucional para experimentar. */
    const registrar = mensaje => {
        flujos.push(mensaje);
        console.log('Navegador: ' + mensaje);
    };
    await mkdir('.private/revision-final', { recursive: true });
    try {
        browser = await chromium.launch({ channel: 'chrome', headless: true });
        const contexts = {};
        const pages = {};
        for (const a of ['admin', 'director', 'secretaria', 'origen', 'destino']) {
            const c = await browser.newContext();
            contexts[a] = c;
            if (a !== 'admin')
                await c.addInitScript(/** Inyecta únicamente el JWT efímero del actor QA en la pestaña de Chrome antes de cargar la aplicación. */  token => {
                    window.sessionStorage.setItem('documental.jwt', token);
                }, usuarios[a].token);
            const p = await c.newPage();
            p.on('pageerror', /** Gestiona el evento del recurso local de pruebas y solicita su cierre o continuación controlada. */  e => errores.push(e.message));
            pages[a] = p;
        }
        /** Navega a la ruta QA y espera su encabezado y finalización de las solicitudes antes de comprobar la pantalla. */
        const ir = async (p, ruta) => {
            await p.goto(url + ruta);
            await p.locator('main h1').first().waitFor();
            await p.waitForLoadState('networkidle');
        };
        /** Pulsa el envío del formulario y espera la ruta de destino antes de continuar las comprobaciones del navegador. */
        const enviar = async (p, boton, patron) => {
            await p.getByRole('button', { name: boton, exact: true }).click();
            await p.waitForURL(patron);
            await p.waitForLoadState('networkidle');
        };
        const admin = pages.admin;
        await ir(admin, '/dashboard');
        assert.ok(admin.url().endsWith('/login'));
        await admin.getByLabel(/Usuario o correo/).fill(usuarios.admin.nombre_usuario);
        await admin.getByLabel('Contraseña', { exact: true }).fill(clave);
        await enviar(admin, 'Ingresar al sistema', /\/dashboard$/);
        flujos.push('Login real, redirección, restauración y logout');
        await admin.reload();
        await admin.getByRole('heading', { name: 'Accesos rápidos', exact: true }).waitFor();
        // Catálogos y su edición a través de formularios reales.
        const ids = {};
        for (const ruta of ['roles', 'oficinas']) {
            await ir(admin, `/${ruta}/nuevo`);
            await admin.getByLabel('Nombre', { exact: true }).fill(`Verificacion ${ruta}`);
            await enviar(admin, 'Guardar', new RegExp(`/${ruta}/[0-9]+$`));
            ids[ruta] = admin.url().split('/').at(-1);
            await ir(admin, `/${ruta}/${ids[ruta]}/editar`);
            await admin.getByLabel('Nombre', { exact: true }).fill(`Verificacion ${ruta} editada`);
            await enviar(admin, 'Guardar', new RegExp(`/${ruta}/[0-9]+$`));
        }
        registrar('Crear y editar roles y oficinas desde interfaz');
        await ir(admin, '/tipos-documentales/nuevo');
        await admin.getByLabel('Nombre', { exact: true }).fill('Verificación navegador');
        await admin.getByLabel('Prefijo', { exact: true }).fill('QAUI');
        await enviar(admin, 'Guardar tipo', /\/tipos-documentales\/[0-9]+$/);
        ids.tipo = admin.url().split('/').at(-1);
        await ir(admin, `/tipos-documentales/${ids.tipo}/editar`);
        await admin.getByLabel('Nombre', { exact: true }).fill('Verificación navegador editada');
        await enviar(admin, 'Guardar tipo', /\/tipos-documentales\/[0-9]+$/);
        registrar('Crear y editar tipo documental no reservado');
        await ir(admin, '/usuarios/nuevo');
        await admin.getByLabel('Nombres', { exact: true }).fill('Cuenta');
        await admin.getByLabel('Apellidos', { exact: true }).fill('Navegador QA');
        await admin.getByLabel('Nombre de usuario', { exact: true }).fill('qa_navegador');
        await admin.getByLabel('Rol', { exact: true }).selectOption(roles.find(/** Selecciona las entradas de roles que cumplen el criterio requerido por la comprobación. */ /** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ r => r.nombre === 'Usuario').id);
        await admin.getByLabel('Oficina', { exact: true }).selectOption(oficinas.find(/** Selecciona las entradas de oficinas que cumplen el criterio requerido por la comprobación. */ /** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ o => o.nombre === 'Subdirección Primaria 1').id);
        await admin.getByLabel('Contraseña inicial', { exact: true }).fill(clave);
        await enviar(admin, 'Guardar cuenta', /\/usuarios\/[0-9]+$/);
        ids.usuario = admin.url().split('/').at(-1);
        await admin.getByRole('button', { name: 'Desactivar cuenta', exact: true }).click();
        await admin.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
        await admin.getByRole('button', { name: 'Desactivar cuenta', exact: true }).click();
        await admin.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
        await admin.getByRole('button', { name: 'Activar cuenta', exact: true }).waitFor();
        await admin.getByRole('button', { name: 'Activar cuenta', exact: true }).click();
        await admin.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
        await admin.getByRole('button', { name: 'Desactivar cuenta', exact: true }).waitFor();
        registrar('Crear cuenta, cancelar confirmación, desactivar y reactivar');
        await ir(admin, `/usuarios/${ids.usuario}/editar`);
        await admin.getByLabel('Apellidos', { exact: true }).fill('Navegador editado');
        await enviar(admin, 'Guardar cuenta', /\/usuarios\/[0-9]+$/);
        // Ubicaciones mediante usuario ordinario: no se fuerzan valores de oficina desde el test.
        const origen = pages.origen;
        await ir(origen, '/ubicaciones/estantes/nuevo');
        await origen.getByLabel('Código de estante', { exact: true }).fill('WEB');
        await enviar(origen, 'Guardar estante', /\/ubicaciones\/estantes\/[0-9]+$/);
        ids.estante = origen.url().split('/').at(-1);
        await ir(origen, `/ubicaciones/estantes/${ids.estante}/editar`);
        await origen.getByLabel('Código de estante', { exact: true }).fill('WEBEDIT');
        await enviar(origen, 'Guardar estante', /\/ubicaciones\/estantes\/[0-9]+$/);
        await ir(origen, '/ubicaciones/archivadores/nuevo');
        await origen.getByLabel('Estante', { exact: true }).selectOption(ids.estante);
        await origen.getByLabel('Número de archivador', { exact: true }).fill('3');
        await enviar(origen, 'Guardar archivador', /\/ubicaciones\/archivadores\/[0-9]+$/);
        ids.archivador = origen.url().split('/').at(-1);
        await ir(origen, `/ubicaciones/archivadores/${ids.archivador}/editar`);
        await origen.getByLabel('Número de archivador', { exact: true }).fill('4');
        await enviar(origen, 'Guardar archivador', /\/ubicaciones\/archivadores\/[0-9]+$/);
        registrar('Estante y archivador propios: creación y edición');
        await ir(origen, '/documentos/nuevo');
        await origen.getByLabel('Tipo documental', { exact: true }).selectOption(tipos.find(/** Selecciona las entradas de tipos que cumplen el criterio requerido por la comprobación. */ /** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ t => t.nombre === 'Informe').id);
        await origen.getByLabel('Asunto', { exact: true }).fill('Documento de navegador QA');
        await origen.getByLabel('Archivador propio (opcional)', { exact: true }).selectOption(ids.archivador);
        await enviar(origen, 'Guardar documento', /\/documentos\/[0-9]+$/);
        ids.documento = origen.url().split('/').at(-1);
        await ir(origen, `/documentos/${ids.documento}/editar`);
        await origen.getByLabel('Asunto', { exact: true }).fill('Documento navegador corregido');
        await origen.getByLabel('Motivo de correccion', { exact: true }).fill('Corrección navegador');
        await enviar(origen, 'Guardar documento', /\/documentos\/[0-9]+$/);
        /** Completa y confirma una operación documental desde la interfaz del actor QA correspondiente. */
        const accionDocumento = async (a, id, accion, destino) => {
            const p = pages[a];
            await ir(p, `/documentos/${id}`);
            await p.getByLabel('Operacion', { exact: true }).selectOption(accion);
            if (destino)
                await p.getByLabel('Destinatario (para autorizacion o salida)', { exact: true }).selectOption(usuarios[destino].id);
            await p.getByLabel('Motivo', { exact: true }).fill('Verificación navegador');
            await p.getByRole('checkbox').check();
            await p.getByRole('button', { name: 'Confirmar operacion', exact: true }).click();
            if (accion === 'salir') {
                await p.waitForURL(/\/movimientos\/[0-9]+$/);
                return p.url().split('/').at(-1);
            }
            await p.getByText('Operacion registrada en el historial.', { exact: true }).waitFor();
        };
        /** Completa y confirma un hecho físico desde la interfaz del participante QA correspondiente. */
        const accionMovimiento = async (a, id, accion) => {
            const p = pages[a];
            await ir(p, `/movimientos/${id}`);
            await p.getByLabel('Operacion', { exact: true }).selectOption(accion);
            await p.getByLabel('Motivo (obligatorio para rechazo, recuperacion o cancelacion)', { exact: true }).fill('Verificación navegador');
            await p.getByRole('checkbox').check();
            await p.getByRole('button', { name: 'Registrar confirmacion', exact: true }).click();
            await p.getByText('Operacion fisica registrada.', { exact: true }).waitFor();
        };
        let mid = await accionDocumento('origen', ids.documento, 'salir', 'secretaria');
        await accionMovimiento('secretaria', mid, 'recibir');
        await accionDocumento('secretaria', ids.documento, 'solicitar-decision');
        await accionDocumento('director', ids.documento, 'autorizar', 'destino');
        mid = await accionDocumento('secretaria', ids.documento, 'salir');
        await accionMovimiento('destino', mid, 'recibir');
        mid = await accionDocumento('destino', ids.documento, 'salir', 'origen');
        await accionMovimiento('origen', mid, 'rechazar');
        await accionMovimiento('destino', mid, 'recuperar');
        mid = await accionDocumento('destino', ids.documento, 'salir', 'origen');
        await accionMovimiento('destino', mid, 'cancelar');
        registrar('Circuito documental completo en navegador: registro, corrección, Mesa, decisión, autorización, salida, recepción, derivación, rechazo, recuperación y cancelación');
        // SíseVe: configuración y permiso por HTTP, acceso y cada operación por interfaz.
        const secreto = 'QA-Siseve-' + randomUUID();
        await req('admin', '/api/siseve/clave', { contrasena: secreto }, 'PUT');
        await ir(origen, '/siseve');
        await origen.getByRole('heading', { name: 'Acceso no autorizado', exact: true }).waitFor();
        await req('admin', '/api/siseve/autorizaciones', { usuario_id: usuarios.origen.id, activo: true }, 'PUT');
        await ir(origen, '/siseve');
        await origen.getByLabel('Contraseña adicional para esta operación', { exact: true }).fill(secreto);
        await origen.getByRole('button', { name: 'Verificar y ejecutar', exact: true }).click();
        await origen.getByRole('heading', { name: 'Documentos SíseVe autorizados', exact: true }).waitFor();
        assert.equal(await origen.getByLabel('Contraseña adicional para esta operación', { exact: true }).inputValue(), '');
        await origen.getByLabel('Operación', { exact: true }).selectOption('opciones');
        await origen.getByLabel('Contraseña adicional para esta operación', { exact: true }).fill(secreto);
        await origen.getByRole('button', { name: 'Verificar y ejecutar', exact: true }).click();
        await origen.getByRole('heading', { name: 'Opciones autorizadas', exact: true }).waitFor();
        await origen.getByLabel('Operación', { exact: true }).selectOption('registrar');
        await origen.getByLabel('Asunto', { exact: true }).fill('Reservado navegador QA');
        await origen.getByLabel('Contraseña adicional para esta operación', { exact: true }).fill(secreto);
        await origen.getByRole('checkbox').check();
        await origen.getByRole('button', { name: 'Verificar y ejecutar', exact: true }).click();
        await origen.getByText('Reservado navegador QA', { exact: true }).waitFor();
        await origen.getByRole('button', { name: 'Preparar historial', exact: true }).click();
        await origen.getByLabel('Contraseña adicional para esta operación', { exact: true }).fill(secreto);
        await origen.getByRole('button', { name: 'Verificar y ejecutar', exact: true }).click();
        await origen.getByRole('heading', { name: 'Historial protegido', exact: true }).waitFor();
        registrar('SíseVe: denegación sin permiso, clave por operación, opciones, registro, historial y borrado del campo secreto');
        // Matriz de todas las pantallas existentes: controles y contenido real de QA.
        const tipo = tipos.find(/** Selecciona las entradas de tipos que cumplen el criterio requerido por la comprobación. */ /** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ t => t.nombre === 'Informe').id;
        const rutasAdmin = ['/dashboard', '/roles', '/roles/nuevo', `/roles/${ids.roles}`, `/roles/${ids.roles}/editar`, '/oficinas', '/oficinas/nuevo', `/oficinas/${ids.oficinas}`, `/oficinas/${ids.oficinas}/editar`, '/usuarios', '/usuarios/nuevo', `/usuarios/${ids.usuario}`, `/usuarios/${ids.usuario}/editar`, '/tipos-documentales', '/tipos-documentales/nuevo', `/tipos-documentales/${tipo}`, `/tipos-documentales/${tipo}/editar`, '/siseve/administracion'];
        const rutasUsuario = ['/dashboard', '/documentos', '/documentos/nuevo', `/documentos/${documento.id}`, `/documentos/${documento.id}/editar`, '/movimientos', `/movimientos/${movimiento.id}`, '/ubicaciones', '/ubicaciones/estantes/nuevo', `/ubicaciones/estantes/${ids.estante}`, `/ubicaciones/estantes/${ids.estante}/editar`, '/ubicaciones/archivadores/nuevo', `/ubicaciones/archivadores/${ids.archivador}`, `/ubicaciones/archivadores/${ids.archivador}/editar`, '/tipos-documentales', `/tipos-documentales/${tipo}`, '/siseve'];
        for (const [a, rutas] of [['admin', rutasAdmin], ['origen', rutasUsuario]])
            for (const ruta of rutas) {
                const p = pages[a];
                for (const width of [1440, 768, 390]) {
                    await p.setViewportSize({ width, height: 950 });
                    await ir(p, ruta);
                    assert.equal(await p.evaluate(/** Detecta desbordamiento horizontal comparando el documento con el ancho real del viewport. */ () => document.documentElement.scrollWidth > innerWidth), false, `Desborde ${a} ${ruta} ${width}`);
                    const sinEtiqueta = await p.locator('main input:not([type="hidden"]), main select, main textarea').evaluateAll(/** Devuelve los controles sin etiqueta nativa ni nombre ARIA para detectar barreras básicas de formulario. */  els => els.filter(/** Selecciona las entradas de els que cumplen el criterio requerido por la comprobación. */ /** Obtiene destinos o nombres accesibles de elementos reales para contrastar la navegación del rol. */ e => !e.labels?.length && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby')).map(/** Transforma cada entrada de els.filter(e => !e.labels?.length && !e.getAttribute('aria-label') && !e.getAttribute('ari para construir los datos que comprueba este escenario. */ /** Obtiene o compara el identificador del fixture para verificar asociaciones sin perder la precisión bigint. */ e => e.id));
                    assert.deepEqual(sinEtiqueta, [], `Controles sin etiqueta ${ruta}`);
                    const referencias = await p.locator('[aria-describedby]').evaluateAll(/** Localiza referencias aria-describedby que no apunten a elementos existentes en la pantalla. */  els => els.flatMap(/** Transforma cada entrada de els para construir los datos que comprueba este escenario. */ /** Comprueba que cada referencia ARIA señale un elemento real de la pantalla. */ e => e.getAttribute('aria-describedby').split(/\s+/).filter(/** Selecciona las entradas de e.getAttribute('aria-describedby').split(/\s+/) que cumplen el criterio requerido por la comprobación. */ /** Obtiene o compara el identificador del fixture para verificar asociaciones sin perder la precisión bigint. */ id => !document.getElementById(id))));
                    assert.deepEqual(referencias, [], 'Referencias ARIA inexistentes ' + ruta);
                    assert.equal(await p.getByRole('heading', { name: 'No se pudo cargar la pantalla', exact: true }).count(), 0, 'Fallo inesperado de ruta ' + ruta);
                    const contraste = await revisarContraste(p);
                    contrastes.push({ perfil: a, ruta, width, ...contraste });
                    assert.deepEqual(contraste.fallos, [], 'Contraste de texto ' + ruta);
                    if (ruta === '/dashboard') {
                        if (width === 1440) {
                            const nav = p.getByRole('navigation', { name: 'Navegación principal', exact: true });
                            assert.equal(await nav.locator('a[aria-current="page"]').count(), 1);
                        }
                        else if (width === 390) {
                            await p.getByRole('button', { name: 'Abrir navegación', exact: true }).click();
                            const menu = p.getByRole('dialog', { name: 'Menú de navegación', exact: true });
                            await menu.waitFor();
                            assert.equal(await menu.locator('a[aria-current="page"]').count(), 1);
                            await p.screenshot({ path: `.private/revision-final/${a}-sidebar-390.png`, fullPage: true });
                            await menu.getByRole('link', { name: 'Documentos', exact: true }).click();
                            await p.waitForURL(/\/documentos$/);
                            assert.equal(await menu.isVisible(), false);
                            await ir(p, ruta);
                            await p.getByRole('button', { name: 'Abrir navegación', exact: true }).click();
                            await p.keyboard.press('Escape');
                            assert.equal(await menu.isVisible(), false);
                            assert.equal(await p.evaluate(/** Lee el nombre accesible del elemento enfocado para comprobar la restitución de foco del menú móvil. */ () => document.activeElement?.getAttribute('aria-label')), 'Abrir navegación');
                            await p.getByRole('button', { name: 'Abrir navegación', exact: true }).click();
                            await p.setViewportSize({ width: 1440, height: 950 });
                            await menu.waitFor({ state: 'hidden' });
                            await p.waitForFunction(/** Espera que todos los diálogos estén cerrados al activar el layout de escritorio. */ () => Array.from(document.querySelectorAll('dialog')).every(/** Comprueba que cada diálogo haya liberado su estado modal al pasar a escritorio. */  d => !d.open));
                            await p.setViewportSize({ width, height: 950 });
                        }
                    }
                    await p.screenshot({ path: `.private/revision-final/${a}-${ruta.replaceAll('/', '_')}-${width}.png`, fullPage: true });
                }
                pantallas.push({ perfil: a, ruta, tamanos: [1440, 768, 390] });
            }
        // Intentos de entrar por URL directa: no depender del menú.
        for (const ruta of ['/usuarios', '/roles', '/oficinas', '/tipos-documentales/nuevo', '/siseve/administracion']) {
            await ir(origen, ruta);
            await origen.getByRole('heading', { name: 'Acceso no autorizado', exact: true }).waitFor();
        }
        // Filtros y búsqueda con navegación real.
        await ir(origen, '/documentos');
        await origen.getByLabel('Buscar por código, asunto o remitente', { exact: true }).fill('Documento navegador');
        await origen.getByRole('button', { name: 'Buscar', exact: true }).click();
        await origen.waitForLoadState('networkidle');
        assert.ok(origen.url().includes('q='));
        await origen.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
        await ir(origen, '/movimientos');
        await origen.getByLabel('Bandeja de operaciones', { exact: true }).selectOption('entrada');
        await origen.waitForLoadState('networkidle');
        assert.ok(origen.url().includes('bandeja=entrada'));
        await admin.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
        await admin.waitForURL(/\/login$/);
        await ir(admin, '/usuarios');
        assert.ok(admin.url().endsWith('/login'));
        for (const ruta of ['/login', '/ruta-inexistente-qa']) {
            for (const width of [1440, 768, 390]) {
                await admin.setViewportSize({ width, height: 950 });
                await ir(admin, ruta);
                assert.equal(await admin.evaluate(/** Detecta desbordamiento horizontal comparando el documento con el ancho real del viewport. */ () => document.documentElement.scrollWidth > innerWidth), false, `Desborde público ${ruta} ${width}`);
                await admin.screenshot({ path: `.private/revision-final/publico-${ruta.replaceAll('/', '_')}-${width}.png`, fullPage: true });
            }
            pantallas.push({ perfil: 'anonimo', ruta, tamanos: [1440, 768, 390] });
        }
        assert.deepEqual(errores, []);
        return { pantallas, flujos, contrastes, errores_javascript: errores, desbordamientos: 0, controles_sin_etiqueta: 0 };
    }
    finally {
        if (browser)
            await browser.close();
        await new Promise(/** Enlaza la finalización asíncrona del recurso o respuesta controlada con la promesa que espera la prueba. */  r => vite.httpServer.close(r));
    }
}
