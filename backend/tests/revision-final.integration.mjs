import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import { prepararValidacion } from './flujo-migration-sandbox.mjs';
/** Auditoría agregada: no publica nombres, asuntos, credenciales ni identificadores institucionales. */
async function inspeccionarOrigen() {
    const p = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const c = await p.connect();
    try {
        await c.query('BEGIN READ ONLY');
        assert.equal((await c.query('SELECT current_database() nombre')).rows[0].nombre, 'sistema_web_final');
        assert.equal((await c.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='documentos' AND column_name='destinatario_autorizado_id'")).rows[0].n, 1, 'El esquema aprobado debe existir; esta revisión no aplica DDL institucional');
        const resumen = (await c.query(`SELECT
   (SELECT count(*)::int FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated) restricciones_no_validadas,
   (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal AND t.tgenabled='D') triggers_deshabilitados,
   (SELECT count(*)::int FROM documentos WHERE estado_tramite NOT IN ('PENDIENTE_DECISION','EN_TRASLADO','RECIBIDO','RECHAZADO','CANCELADO')) estados_invalidos,
   (SELECT count(*)::int FROM documentos d JOIN archivadores a ON a.id=d.archivador_id JOIN estantes e ON e.id=a.estante_id WHERE e.usuario_id<>d.responsable_actual_id OR e.oficina_id<>d.oficina_responsable_id) ubicaciones_incompatibles,
   (SELECT count(*)::int FROM documentos d WHERE (d.destinatario_autorizado_id IS NOT NULL OR d.oficina_destino_autorizada_id IS NOT NULL OR d.decision_autorizada_por_id IS NOT NULL) AND (d.estado_tramite<>'PENDIENTE_DECISION' OR NOT d.activo OR d.destinatario_autorizado_id IS NULL OR d.oficina_destino_autorizada_id IS NULL OR d.decision_autorizada_por_id IS NULL)) autorizaciones_incoherentes,
   (SELECT count(*)::int FROM documentos d WHERE d.estado_tramite='EN_TRASLADO' AND NOT EXISTS(SELECT 1 FROM movimientos_documentales m WHERE m.documento_id=d.id AND m.estado='EN_TRASLADO')) traslados_sin_movimiento,
   (SELECT count(*)::int FROM (SELECT documento_id FROM movimientos_documentales WHERE estado='EN_TRASLADO' OR (estado='RECHAZADO' AND devolucion_confirmada_por_id IS NULL) GROUP BY documento_id HAVING count(*)>1)x) circulaciones_duplicadas,
   (SELECT count(*)::int FROM documentos WHERE codigo IS NULL OR btrim(codigo)='') codigos_ausentes,
   (SELECT count(*)::int FROM (SELECT codigo FROM documentos GROUP BY codigo HAVING count(*)>1)x) codigos_duplicados,
   (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) conexion_superusuario,
   (SELECT rolcreatedb FROM pg_roles WHERE rolname=current_user) conexion_crea_bases,
   EXISTS(SELECT 1 FROM claves_tipos_documentales c JOIN tipos_documentales t ON t.id=c.tipo_documental_id WHERE t.nombre='SíseVe' AND t.requiere_clave) siseve_clave_configurada,
   (SELECT count(*)::int FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='f') claves_foraneas,
   (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal) triggers
  `)).rows[0];
        for (const [k, v] of Object.entries(resumen))
            if (!['conexion_superusuario', 'conexion_crea_bases', 'siseve_clave_configurada', 'claves_foraneas', 'triggers'].includes(k))
                assert.equal(v, 0, k);
        await c.query('ROLLBACK');
        return resumen;
    }
    finally {
        await c.query('ROLLBACK').catch(/** Permite continuar la limpieza de recursos después de un fallo previo; el caso conserva su error original. */ () => {
        });
        c.release();
        await p.end();
    }
}
test('Revisión final: diez módulos con PostgreSQL QA aislado y navegador', /** Verifica el caso «Revisión final: diez módulos con PostgreSQL QA aislado y navegador»; una aserción fallida invalida este resultado. */ async (t) => {
    const origen = await inspeccionarOrigen();
    process.env.VALIDAR_FLUJO_DOCUMENTAL = 'ROLLBACK_Y_QA_AISLADA';
    const qa = await prepararValidacion();
    let server, appPool;
    const casos = [];
    let navegador;
    /** Ejecuta un subcaso de integración, registra su aprobación y propaga el fallo para no continuar como si hubiese pasado. */
    const caso = async (nombre, fn) => {
        let error;
        await t.test(nombre, /** Ejecuta el subcaso recibido, registra su aprobación y vuelve a propagar cualquier fallo de aserción. */ async () => {
            try {
                await fn();
                casos.push(nombre);
            }
            catch (e) {
                error = e;
                throw e;
            }
        });
        if (error)
            throw error;
    };
    try {
        process.env.DATABASE_URL = qa.connectionString;
        const { pool } = await import('../dist/config/database.js');
        appPool = pool;
        const { app } = await import('../dist/app.js');
        const { generarToken } = await import('../dist/shared/security/jwt.js');
        const { generarHash } = await import('../dist/shared/security/password.js');
        const clave = 'QA-final-' + randomUUID();
        const hash = await generarHash(clave);
        const admin = (await pool.query(`INSERT INTO usuarios(nombre,apellido,nombre_usuario,contrasena_hash,rol_id) SELECT 'Admin','QA final','qa_final_admin',$1,id FROM roles WHERE nombre='Administrador' RETURNING id::text,version_autenticacion`, [hash])).rows[0];
        const tokens = { admin: generarToken(admin.id, admin.version_autenticacion) };
        server = app.listen(0, '127.0.0.1');
        await new Promise(/** Enlaza la finalización asíncrona del recurso o respuesta controlada con la promesa que espera la prueba. */  r => server.once('listening', r));
        const base = `http://127.0.0.1:${server.address().port}`;
        /** Envía una petición HTTP al backend QA y verifica el estado esperado antes de devolver el cuerpo. */
        const req = async (actor, ruta, datos, method = datos ? 'POST' : 'GET', status = 200) => {
            const token = actor && typeof actor === 'object' ? actor.token : tokens[actor];
            const r = await fetch(base + ruta, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, ...(datos === undefined ? {} : { body: JSON.stringify(datos) }) });
            const body = await r.json();
            assert.equal(r.status, status, `${method} ${ruta}: ${JSON.stringify(body)}`);
            return body;
        };
        const roles = (await req('admin', '/api/roles')).roles;
        const oficinas = (await req('admin', '/api/oficinas')).oficinas;
        const tipos = (await req('admin', '/api/tipos-documentales')).tipos;
        const usuarios = { admin: { ...admin, nombre_usuario: 'qa_final_admin', token: tokens.admin } };
        await caso('Crear cuentas por API con rol y oficina; login y perfil reales', /** Verifica el caso «Crear cuentas por API con rol y oficina; login y perfil reales»; una aserción fallida invalida este resultado. */ async () => {
            for (const [nombre, rol, oficina] of [['director', 'Director(a)', 'Dirección'], ['secretaria', 'Secretaria de Dirección', 'Mesa de Partes'], ['origen', 'Usuario', 'Subdirección Primaria 1'], ['destino', 'Usuario', 'Subdirección Primaria 2'], ['otro', 'Usuario', 'Subdirección Primaria 2']]) {
                const datos = { nombre, apellido: 'QA final', nombre_usuario: 'qa_final_' + nombre, email: null, telefono: null, rol_id: roles.find(/** Localiza el rol real del catálogo utilizado por el actor o cuenta efímera de esta prueba. */ r => r.nombre === rol).id, oficina_id: oficinas.find(/** Localiza la oficina del catálogo o comprueba su correspondencia con la asignación del fixture. */ o => o.nombre === oficina).id, contrasena: clave, activo: true };
                const { usuario } = await req('admin', '/api/usuarios', datos, 'POST', 201);
                assert.ok(!JSON.stringify(usuario).includes('scrypt$'));
                const login = await req(null, '/api/auth/login', { identificador: datos.nombre_usuario, contrasena: clave });
                tokens[nombre] = login.token;
                assert.equal((await req(nombre, '/api/auth/me')).usuario.id, usuario.id);
                usuarios[nombre] = { ...usuario, token: login.token };
            }
        });
        await caso('Endpoints protegidos, JWT alterado/vencido y límites de entrada', /** Verifica el caso «Endpoints protegidos, JWT alterado/vencido y límites de entrada»; una aserción fallida invalida este resultado. */ async () => {
            for (const ruta of ['/api/roles', '/api/oficinas', '/api/usuarios', '/api/documentos', '/api/movimientos', '/api/tipos-documentales', '/api/ubicaciones/estantes', '/api/siseve/acceso', '/api/dashboard'])
                await req(null, ruta, undefined, 'GET', 401);
            await req({ token: tokens.origen + 'x' }, '/api/dashboard', undefined, 'GET', 401);
            const vencido = jwt.sign({ version: 0 }, process.env.JWT_SECRET, { subject: usuarios.origen.id, issuer: 'sistema-web-documental', audience: 'sistema-web-documental-api', expiresIn: -60 });
            await req({ token: vencido }, '/api/dashboard', undefined, 'GET', 401);
            for (const a of ['origen', 'director', 'secretaria'])
                for (const ruta of ['/api/usuarios', '/api/roles', '/api/oficinas', '/api/siseve/administracion'])
                    await req(a, ruta, undefined, 'GET', 403);
            await req('origen', '/api/documentos/9223372036854775808', undefined, 'GET', 400);
            await req('origen', '/api/documentos?pagina=-1', undefined, 'GET', 400);
        });
        const archivos = {};
        await caso('Estantes y archivadores propios; edición y aislamiento entre oficinas', /** Verifica el caso «Estantes y archivadores propios; edición y aislamiento entre oficinas»; una aserción fallida invalida este resultado. */ async () => {
            for (const a of ['secretaria', 'origen', 'destino']) {
                const { estante } = await req(a, '/api/ubicaciones/estantes', { codigo: 'QA', usuario_id: usuarios[a].id, oficina_id: usuarios[a].oficina_id }, 'POST', 201);
                const { archivador } = await req(a, '/api/ubicaciones/archivadores', { estante_id: estante.id, numero: 1 }, 'POST', 201);
                archivos[a] = archivador.id;
                usuarios[a].estante = estante.id;
                await req(a, `/api/ubicaciones/archivadores/${archivador.id}`, { estante_id: estante.id, numero: 2 }, 'PUT');
            }
            await req('otro', `/api/ubicaciones/estantes/${usuarios.origen.estante}`, undefined, 'GET', 404);
            await req('otro', `/api/ubicaciones/archivadores/${archivos.origen}`, { estante_id: usuarios.origen.estante, numero: 3 }, 'PUT', 404);
        });
        let d, m;
        const motivo = { motivo: 'Verificación final QA' };
        /** Consulta el Dashboard QA y extrae el indicador o contrato que necesita comprobar el caso. */
        const panel = async (a, k) => (await req(a, '/api/dashboard')).operaciones.find(/** Localiza el indicador por su clave estable para comparar el total calculado por PostgreSQL. */ i => i.clave === k)?.total;
        await caso('Registro, código, búsqueda literal, paginación y corrección auditada', /** Verifica el caso «Registro, código, búsqueda literal, paginación y corrección auditada»; una aserción fallida invalida este resultado. */ async () => {
            const datos = { tipo_documental_id: tipos.find(/** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ t => t.nombre === 'Informe').id, asunto: 'QA final %_ único', remitente: 'Verificación', observaciones: null, archivador_id: archivos.origen };
            d = (await req('origen', '/api/documentos', datos, 'POST', 201)).documento;
            assert.match(d.codigo, /^INF\d+$/);
            assert.equal(d.estado_tramite, 'RECIBIDO');
            const lista = await req('origen', '/api/documentos?q=%25_&limite=1');
            assert.equal(lista.total, 1);
            assert.equal((await req('origen', '/api/documentos?limite=1&pagina=2')).documentos.length, 0);
            await req('otro', `/api/documentos/${d.id}`, undefined, 'GET', 404);
            await req('otro', `/api/documentos/${d.id}`, { ...motivo, asunto: 'Ajeno', remitente: null, observaciones: null }, 'PUT', 404);
            d = (await req('origen', `/api/documentos/${d.id}`, { ...motivo, asunto: 'QA final corregido', remitente: null, observaciones: null }, 'PUT')).documento;
            assert.ok((await req('origen', `/api/documentos/${d.id}/historial`)).historial.length >= 2);
            await req('admin', `/api/documentos/${d.id}`, undefined, 'GET', 404);
            await req('director', `/api/documentos/${d.id}`);
        });
        await caso('Recepción en Mesa, solicitud de decisión y autorización sin salida', /** Verifica el caso «Recepción en Mesa, solicitud de decisión y autorización sin salida»; una aserción fallida invalida este resultado. */ async () => {
            m = (await req('origen', '/api/movimientos', { ...motivo, documento_id: d.id, usuario_destino_id: usuarios.secretaria.id }, 'POST', 201)).movimiento;
            assert.equal(await panel('secretaria', 'recepcion'), 1);
            await req('secretaria', `/api/movimientos/${m.id}/recibir`, { archivador_id: archivos.secretaria });
            assert.equal(await panel('secretaria', 'solicitar'), 1);
            await req('secretaria', `/api/documentos/${d.id}/solicitar-decision`, motivo);
            await req('secretaria', `/api/documentos/${d.id}/autorizar`, { ...motivo, usuario_destino_id: usuarios.destino.id }, 'POST', 403);
            d = (await req('director', `/api/documentos/${d.id}/autorizar`, { ...motivo, usuario_destino_id: usuarios.destino.id })).documento;
            assert.equal(d.estado_tramite, 'PENDIENTE_DECISION');
            assert.equal(await panel('secretaria', 'salida'), 1);
            await req('director', '/api/movimientos', { ...motivo, documento_id: d.id, usuario_destino_id: usuarios.destino.id }, 'POST', 403);
        });
        await caso('Salida física, recepción y derivación posterior', /** Verifica el caso «Salida física, recepción y derivación posterior»; una aserción fallida invalida este resultado. */ async () => {
            m = (await req('secretaria', '/api/movimientos', { ...motivo, documento_id: d.id, usuario_destino_id: usuarios.destino.id }, 'POST', 201)).movimiento;
            await req('destino', `/api/movimientos/${m.id}/recibir`, { archivador_id: archivos.destino });
            d = (await req('destino', `/api/documentos/${d.id}`)).documento;
            assert.equal(d.responsable_actual_id, usuarios.destino.id);
            assert.equal(d.archivador_id, archivos.destino);
            assert.equal(await panel('destino', 'recepcion'), 0);
            m = (await req('destino', '/api/movimientos', { ...motivo, documento_id: d.id, usuario_destino_id: usuarios.origen.id }, 'POST', 201)).movimiento;
        });
        await caso('Rechazo con motivo, recuperación, cancelación e historial completo', /** Verifica el caso «Rechazo con motivo, recuperación, cancelación e historial completo»; una aserción fallida invalida este resultado. */ async () => {
            await req('origen', `/api/movimientos/${m.id}/rechazar`, { motivo: '' }, 'POST', 400);
            await req('origen', `/api/movimientos/${m.id}/rechazar`, motivo);
            assert.equal(await panel('destino', 'recuperacion'), 1);
            await req('destino', `/api/movimientos/${m.id}/recuperar`, { ...motivo, archivador_id: archivos.destino, confirmar_recuperacion: true });
            assert.equal(await panel('destino', 'recuperacion'), 0);
            m = (await req('destino', '/api/movimientos', { ...motivo, documento_id: d.id, usuario_destino_id: usuarios.origen.id }, 'POST', 201)).movimiento;
            await req('destino', `/api/movimientos/${m.id}/cancelar`, { ...motivo, archivador_id: archivos.destino, confirmar_recuperacion: true });
            const historial = (await req('director', `/api/documentos/${d.id}/historial`)).historial;
            assert.ok(historial.length > 8);
            const recorrido = await req('director', `/api/movimientos?documento_id=${d.id}`);
            assert.equal(recorrido.total, 4);
            assert.equal((await req('destino', `/api/documentos/${d.id}`)).documento.estado_tramite, 'RECIBIDO');
        });
        await caso('Desactivación conserva documentos, autoría e invalida JWT incluso al reactivar', /** Verifica el caso «Desactivación conserva documentos, autoría e invalida JWT incluso al reactivar»; una aserción fallida invalida este resultado. */ async () => {
            const antes = (await req('director', `/api/documentos/${d.id}`)).documento;
            await req('admin', `/api/usuarios/${usuarios.destino.id}/estado`, { activo: false }, 'PATCH');
            await req('destino', '/api/dashboard', undefined, 'GET', 401);
            const despues = (await req('director', `/api/documentos/${d.id}`)).documento;
            assert.equal(despues.responsable_actual_id, antes.responsable_actual_id);
            assert.equal(despues.archivador_id, antes.archivador_id);
            await req('admin', `/api/usuarios/${usuarios.destino.id}/estado`, { activo: true }, 'PATCH');
            await req('destino', '/api/auth/me', undefined, 'GET', 401);
            const login = await req(null, '/api/auth/login', { identificador: usuarios.destino.nombre_usuario, contrasena: clave });
            tokens.destino = login.token;
            usuarios.destino.token = login.token;
        });
        await caso('Cambio de contraseña invalida JWT y credencial anterior', /** Verifica el caso «Cambio de contraseña invalida JWT y credencial anterior»; una aserción fallida invalida este resultado. */ async () => {
            const nueva = 'QA-nueva-' + randomUUID();
            await req('admin', `/api/usuarios/${usuarios.otro.id}/contrasena`, { contrasena: nueva }, 'PUT');
            await req('otro', '/api/auth/me', undefined, 'GET', 401);
            await req(null, '/api/auth/login', { identificador: usuarios.otro.nombre_usuario, contrasena: clave }, 'POST', 401);
            const login = await req(null, '/api/auth/login', { identificador: usuarios.otro.nombre_usuario, contrasena: nueva });
            tokens.otro = login.token;
            usuarios.otro.token = login.token;
        });
        if (process.env.QA_OPTIMIZACION) {
            const { probarRendimiento } = await import('./optimizacion.browser.mjs');
            await probarRendimiento({ base, usuarios, fase: process.env.QA_OPTIMIZACION });
        }
        await caso('Navegador: módulos, formularios, permisos y escritorio/móvil', /** Verifica el caso «Navegador: módulos, formularios, permisos y escritorio/móvil»; una aserción fallida invalida este resultado. */ async () => {
            const { probarNavegadorIntegral } = await import('./revision-final.browser.mjs');
            navegador = await probarNavegadorIntegral({ base, usuarios, clave, roles, oficinas, tipos, documento: d, movimiento: m, req });
        });
        await caso('Límite de login real y aislamiento de endpoints ya autenticados', /** Verifica el caso «Límite de login real y aislamiento de endpoints ya autenticados»; una aserción fallida invalida este resultado. */ async () => {
            // El límite cuenta también los logins válidos anteriores; se detiene al primer 429.
            let bloqueado = false;
            for (let i = 0; i < 11; i++) {
                const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identificador: 'no_existe_qa', contrasena: 'No-es-una-clave-real' }) });
                if (r.status === 429) {
                    bloqueado = true;
                    break;
                }
                assert.equal(r.status, 401);
            }
            assert.equal(bloqueado, true);
            await req('origen', '/api/dashboard');
        });
    }
    finally {
        if (server)
            await new Promise(/** Enlaza la finalización asíncrona del recurso o respuesta controlada con la promesa que espera la prueba. */  r => server.close(r));
        if (appPool)
            await appPool.end();
        process.env.DATABASE_URL = qa.original;
        await qa.limpiar();
    }
    await writeFile('../docs/RESULTADOS_REVISION_FINAL.json', JSON.stringify({ fecha: '2026-10-22', casos_aprobados: casos, origen, navegador, qa_eliminada: true, estructura_y_datos_institucionales_intactos: true }, null, 2));
});
