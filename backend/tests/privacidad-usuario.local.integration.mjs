import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parse } from 'dotenv';
import pg from 'pg';
import { test } from 'node:test';
import { verificarConexionLocal } from '../src/config/local.ts';
import { generarToken } from '../src/shared/security/jwt.ts';

test('Usuario: registros institucionales invisibles y endpoints PDF denegados en local', async () => {
    const url = parse(fs.readFileSync('.env')).DATABASE_URL;
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
        const identidad = await verificarConexionLocal(c, url);
        const usuarios = (await c.query("SELECT u.id::text,u.version_autenticacion FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.activo AND r.nombre='Usuario'")).rows;
        const documentos = (await c.query("SELECT d.id::text,d.codigo,d.asunto FROM documentos d JOIN usuarios u ON u.id=d.registrado_por_id JOIN roles r ON r.id=u.rol_id WHERE r.nombre IN ('Secretaria de Dirección','Director(a)')")).rows;
        assert.ok(usuarios.length && documentos.length);
        const tablas = ['documentos','documentos_pdf','pdf_cargas','pdf_objetos','pdf_eventos'];
        const snapshot = async () => {
            const filas = [];
            for (const t of tablas) filas.push((await c.query(`SELECT to_jsonb(t) fila FROM ${t} t ORDER BY to_jsonb(t)::text`)).rows);
            return filas;
        };
        const antes = await snapshot();
        let solicitudes = 0;
        for (const usuario of usuarios) {
            const token = generarToken(usuario.id, usuario.version_autenticacion);
            async function http(path, status, body) {
                const r = await fetch('http://localhost:5173/api' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, Origin: 'http://localhost:5173', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
                solicitudes++;
                const data = await r.json();
                assert.equal(r.status, status, `${path}: ${JSON.stringify(data)}`);
                return data;
            }
            const lista = await http('/documentos?limite=100', 200);
            assert.ok(lista.documentos.every(d => d.registrado_por_id === usuario.id));
            for (const d of documentos) {
                await http(`/documentos/${d.id}`, 404);
                await http(`/documentos/${d.id}/pdf`, 404);
            }
            // Las peticiones de escritura negativas usan únicamente fixtures identificados.
            const fixture = documentos.find(d => /^QA-PDF-PERMISOS/.test(d.asunto));
            assert.ok(fixture, 'Se necesita fixture local QA-PDF-PERMISOS existente');
            const ruta = `/documentos/${fixture.id}`;
            assert.equal((await http('/documentos?q=' + encodeURIComponent(fixture.codigo), 200)).total, 0);
            await http(ruta + '/historial', 404);
            await http(ruta + '/pdf/abrir', 404, { descargar: false });
            await http(ruta + '/pdf/abrir', 404, { descargar: true });
            await http(ruta + '/pdf/cargas', 404, { nombre: 'privacidad.pdf', tamano: 100, mime: 'application/pdf', revision: null });
            await http(ruta + '/pdf/confirmar', 404, { carga: randomUUID() });
            await http(ruta + '/pdf/eliminar', 404, { revision: randomUUID(), confirmar: true });
            const propio = lista.documentos[0];
            if (propio) { await http('/documentos/' + propio.id, 200); await http(`/documentos/${propio.id}/pdf`, 200); }
        }
        assert.deepEqual(await snapshot(), antes, 'Registros y metadatos PDF conservados');
        console.log({ base: identidad.base, usuarios: usuarios.length, documentosInstitucionales: documentos.length, solicitudes, conservacion: true });
    } finally { await c.end(); }
});
