import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { URL } from 'node:url';
import { abrirQa } from './neon-qa-guard.mjs';

const { qa, pool } = await abrirQa();
Object.assign(process.env, qa);
const { generarHash } = await import('../dist/shared/security/password.js');
const tag = randomUUID().slice(0, 8);
const claveUsuario = 'Fixture-runtime-' + randomBytes(24).toString('base64url');
const claveNueva = 'Fixture-runtime-nueva-' + randomBytes(24).toString('base64url');
const claveSiseve = 'Fixture-restringido-' + randomUUID();
process.env.DB_PROFILE = 'neon-qa';
process.env.CORS_ORIGINS = 'https://qa-pages.example';
process.env.TRUST_PROXY_HOPS = '1';
const remoto = process.argv.includes('--remoto');
let server, appPool, host;
if (remoto) {
    // El destino se registra únicamente después de verificar el servicio creado y su configuración QA.
    const despliegue = JSON.parse(readFileSync('../.private/render/DEPLOYMENT.json', 'utf8'));
    assert.equal(despliegue.neonBranchId, qa.NEON_BRANCH_ID, 'El servicio no tiene la rama QA contrastada');
    assert.equal(despliegue.qaConfigurada, true);
    const url = new URL(despliegue.backend);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname.endsWith('.onrender.com'), true);
    assert.equal(url.origin, despliegue.backend);
    host = url.origin;
} else {
    const { app } = await import('../dist/app.js');
    appPool = (await import('../dist/config/database.js')).pool;
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    host = 'http://127.0.0.1:' + server.address().port;
}
const resultados = [];
const caso = async (nombre, fn) => { await fn(); resultados.push(nombre); console.log('OK API Node:', nombre); };
const call = async (token, ruta, body, status = 200, method = body === undefined ? 'GET' : 'POST') => {
    const r = await fetch(host + ruta, { method, signal: globalThis.AbortSignal.timeout(30000),
        headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json',
            'X-Forwarded-For': '198.51.100.61' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.equal(r.status, status, method + ' ' + ruta + ' devolvió ' + r.status);
    return r.headers.get('content-type')?.includes('application/json') ? r.json() : { error: await r.text() };
};
let tokenAdmin, tokenUsuario, tokenOtro, usuario, otro, oficina, tipo, estante, archivador;
try {
    const hash = await generarHash(claveUsuario);
    const nombreAdmin = 'qa_runtime_admin_' + tag;
    await pool.query(`INSERT INTO usuarios(nombre,apellido,nombre_usuario,contrasena_hash,rol_id)
        SELECT 'Fixture','Runtime',$1,$2,id FROM roles WHERE nombre='Administrador'`, [nombreAdmin, hash]);
    tokenAdmin = (await call(null, '/api/auth/login', { identificador: nombreAdmin, contrasena: claveUsuario })).token;
    const roles = (await call(tokenAdmin, '/api/roles')).roles;
    const rolUsuario = roles.find(r => r.nombre === 'Usuario').id;
    await caso('roles y oficinas: escritura administrativa y permisos', async () => {
        const rol = (await call(tokenAdmin, '/api/roles', { nombre: 'Rol runtime ' + tag }, 201)).registro;
        await call(tokenAdmin, '/api/roles/' + rol.id, { nombre: 'Rol runtime editado ' + tag }, 200, 'PUT');
        oficina = (await call(tokenAdmin, '/api/oficinas', { nombre: 'Oficina runtime ' + tag }, 201)).registro;
        await call(tokenAdmin, '/api/oficinas/' + oficina.id, { nombre: 'Oficina runtime editada ' + tag }, 200, 'PUT');
        await call(null, '/api/roles', undefined, 401);
    });
    await caso('usuarios, scrypt, JWT y recuperación de sesión', async () => {
        const datos = nombre => ({ nombre: 'Fixture', apellido: 'Runtime', nombre_usuario: nombre,
            email: null, telefono: null, rol_id: rolUsuario, oficina_id: oficina.id, contrasena: claveUsuario });
        usuario = (await call(tokenAdmin, '/api/usuarios', datos('qa_runtime_' + tag), 201)).usuario;
        otro = (await call(tokenAdmin, '/api/usuarios', datos('qa_runtime_otro_' + tag), 201)).usuario;
        tokenUsuario = (await call(null, '/api/auth/login', { identificador: usuario.nombre_usuario, contrasena: claveUsuario })).token;
        tokenOtro = (await call(null, '/api/auth/login', { identificador: otro.nombre_usuario, contrasena: claveUsuario })).token;
        assert.equal((await call(tokenUsuario, '/api/auth/me', undefined, 200, 'GET')).usuario.id, usuario.id);
        await call(tokenUsuario, '/api/roles', undefined, 403);
        await call(tokenUsuario, '/api/usuarios', undefined, 403);
    });
    await caso('tipos y ubicaciones: mismas unidades de trabajo directas', async () => {
        const prefijo = 'Q' + [...randomBytes(6)].map(n => String.fromCharCode(65 + n % 26)).join('');
        tipo = (await call(tokenAdmin, '/api/tipos-documentales', { nombre: 'Tipo runtime ' + tag, prefijo_codigo: prefijo }, 201)).tipo;
        await call(tokenAdmin, '/api/tipos-documentales/' + tipo.id, { nombre: 'Tipo runtime editado ' + tag, prefijo_codigo: prefijo }, 200, 'PUT');
        estante = (await call(tokenUsuario, '/api/ubicaciones/estantes', { codigo: 'QA', usuario_id: usuario.id, oficina_id: oficina.id }, 201)).estante;
        await call(tokenUsuario, '/api/ubicaciones/estantes/' + estante.id, { codigo: 'QB', usuario_id: usuario.id, oficina_id: oficina.id }, 200, 'PUT');
        archivador = (await call(tokenUsuario, '/api/ubicaciones/archivadores', { estante_id: estante.id, numero: 1 }, 201)).archivador;
        await call(tokenUsuario, '/api/ubicaciones/archivadores/' + archivador.id, { estante_id: estante.id, numero: 2 }, 200, 'PUT');
    });
    await caso('registro, código, corrección y Dashboard mediante Express', async () => {
        const documento = (await call(tokenUsuario, '/api/documentos', { tipo_documental_id: tipo.id,
            asunto: 'Fixture HTTP runtime', remitente: null, observaciones: null, archivador_id: archivador.id }, 201)).documento;
        assert.equal(documento.estado_tramite, 'RECIBIDO');
        assert.ok(documento.codigo.startsWith(tipo.prefijo_codigo));
        await call(tokenUsuario, '/api/documentos/' + documento.id, { asunto: 'Fixture corregido',
            remitente: null, observaciones: null, motivo: 'Comprobación QA' }, 200, 'PUT');
        assert.equal((await call(tokenUsuario, '/api/dashboard')).alcance, 'personal');
    });
    await caso('SíseVe: éxitos no consumen el límite de fallos', async () => {
        await call(tokenAdmin, '/api/siseve/clave', { contrasena: claveSiseve }, 200, 'PUT');
        await call(tokenAdmin, '/api/siseve/autorizaciones', { usuario_id: usuario.id, activo: true }, 200, 'PUT');
        for (let i = 0; i < 15; i++) await call(tokenUsuario, '/api/siseve/operaciones', { operacion: 'listar', datos: {}, clave: claveSiseve });

    });
    await caso('SíseVe: diez fallos por cuenta, cuenta independiente y sin bypass', async () => {
        for (let i = 0; i < 10; i++) await call(tokenOtro, '/api/siseve/operaciones', { operacion: 'listar', datos: {}, clave: claveSiseve }, 403);
        await call(tokenOtro, '/api/siseve/operaciones', { operacion: 'listar', datos: {}, clave: claveSiseve }, 429);
        await call(tokenUsuario, '/api/siseve/operaciones', { operacion: 'listar', datos: {}, clave: claveSiseve });
        for (let i = 0; i < 29; i++) await call(tokenAdmin, '/api/siseve/clave', { contrasena: 'x' }, 400, 'PUT');
        await call(tokenAdmin, '/api/siseve/clave', { contrasena: 'x' }, 429, 'PUT');
    });
    await caso('revocación de JWT por contraseña, desactivación y reactivación', async () => {
        await call(tokenAdmin, '/api/usuarios/' + usuario.id + '/contrasena', { contrasena: claveNueva }, 200, 'PUT');
        await call(tokenUsuario, '/api/auth/me', undefined, 401);
        await call(null, '/api/auth/login', { identificador: usuario.nombre_usuario, contrasena: claveUsuario }, 401);
        tokenUsuario = (await call(null, '/api/auth/login', { identificador: usuario.nombre_usuario, contrasena: claveNueva })).token;
        await call(tokenAdmin, '/api/usuarios/' + usuario.id + '/estado', { activo: false }, 200, 'PATCH');
        await call(tokenUsuario, '/api/auth/me', undefined, 401);
        await call(tokenAdmin, '/api/usuarios/' + usuario.id + '/estado', { activo: true }, 200, 'PATCH');
        await call(tokenUsuario, '/api/auth/me', undefined, 401);
        const nuevo = (await call(null, '/api/auth/login', { identificador: usuario.nombre_usuario, contrasena: claveNueva })).token;
        await call(nuevo, '/api/auth/me');
    });
    await caso('auditoría con actor y sin contraseñas de los fixtures', async () => {
        const auditoria = (await pool.query('SELECT campos_modificados FROM historial_modificaciones WHERE usuario_actor_id=$1', [usuario.id])).rows;
        assert.ok(auditoria.length > 0);
        const texto = JSON.stringify(auditoria);
        for (const secreto of [claveUsuario, claveNueva, claveSiseve, hash]) assert.equal(texto.includes(secreto), false);
    });
} finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (appPool) await appPool.end();
    await pool.end();
    writeFileSync('../.private/render/' + (remoto ? 'RESULTADOS_API_REMOTA.json' : 'RESULTADOS_API_NODE.json'),
        JSON.stringify({ runtime: remoto ? 'Render remoto HTTPS + Neon QA' : 'HTTP Express Node.js + Neon QA', resultados }, null, 2));
}
