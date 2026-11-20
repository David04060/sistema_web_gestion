import './helpers/exigir-aislamiento.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { URLSearchParams } from 'node:url';
import { leerFixtures, verificarEntornoPrueba } from './helpers/entorno-prueba.mjs';
import { app } from '../dist/app.js';
import { pool } from '../dist/config/database.js';
import { generarToken } from '../dist/shared/security/jwt.js';
import { crearUnidad } from '../dist/modules/usuarios/administracion.operaciones.js';

test('Búsqueda de ubicaciones y validación de altas y cambios en PostgreSQL aislado', async () => {
  await verificarEntornoPrueba(pool);
  const f = leerFixtures();
  const { usuario, sinOficina, admin, director, secretaria } = f.cuentas;
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const crear = (actor, nombre, padre_id = null) =>
    crearUnidad(actor.id, { clase: padre_id ? 'Archivador' : 'Estante', nombre, padre_id });
  async function pedir(ruta, actor = usuario, body) {
    const token = generarToken(actor.id, actor.version_autenticacion);
    const respuesta = await fetch('http://127.0.0.1:' + server.address().port + '/api' + ruta, {
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      ...(body && { method: 'POST', body: JSON.stringify(body) }),
    });
    return { status: respuesta.status, body: await respuesta.json() };
  }
  const buscar = (q, actor) => pedir('/documentos/ubicaciones?' + new URLSearchParams({ q }), actor);
  try {
    assert.deepEqual(await buscar('inexistente'), {
      status: 200, body: { ubicaciones: [], hay_mas: false },
    });
    const grande = await crear(usuario, 'Ficha de Matrícula');
    const breve = await crear(usuario, 'Actas');
    await crear(usuario, 'Estante sin contenido');
    const a = await crear(usuario, 'Secundaria 1.º A', grande.id);
    const b = await crear(usuario, 'Secundaria 1.º A', breve.id);
    const inactiva = await crear(usuario, 'Contenido retirado', grande.id);
    await pool.query('UPDATE unidades_ubicacion SET activo=false WHERE id=$1', [inactiva.id]);
    const padreInactivo = await crear(usuario, 'Estante desactivado');
    const hijo = await crear(usuario, 'Contenido bajo padre inactivo', padreInactivo.id);
    await pool.query('UPDATE unidades_ubicacion SET activo=false WHERE id=$1', [padreInactivo.id]);
    for (let i = 1; i <= 22; i++) await crear(usuario, 'Secundaria tomo ' + i, grande.id);
    const ajena = await crear(director, 'Ubicación ajena');
    assert.equal((await buscar('')).body.ubicaciones.length, 5);
    assert.equal((await buscar('')).body.hay_mas, true);
    assert.equal((await buscar('s')).body.ubicaciones.length, 20);
    assert.equal((await buscar('matricula')).body.hay_mas, true);
    const homonimos = (await buscar('1.º A')).body.ubicaciones;
    assert.deepEqual(homonimos.map(({id,ruta})=>({id,ruta})), [
      { id: b.id, ruta: 'Estante: Actas › Secundaria 1.º A · Archivador' },
      { id: a.id, ruta: 'Estante: Ficha de Matrícula › Secundaria 1.º A · Archivador' },
    ]);
    for (const q of ['%', '_', 'retirado', 'padre inactivo', 'ajena'])
      assert.deepEqual((await buscar(q)).body.ubicaciones, []);
    assert.deepEqual((await buscar('', sinOficina)).body.ubicaciones, []);
    assert.equal((await buscar('', admin)).status, 403);
    assert.equal((await pedir('/documentos/ubicaciones?propietario_id=' + director.id)).status, 400);
    assert.equal((await pedir('/ubicaciones?usuario_id=' + usuario.id, admin)).status, 200);
    assert.ok(!('unidades' in (await pedir('/documentos/opciones')).body));
    const alta = { tipo_id: f.tipos.usuario, clasificacion: 'RECIBIDO', asunto: 'Ubicación de prueba' };
    assert.equal((await pedir('/documentos', admin, { ...alta, unidad_id: a.id })).status, 403);
    for (const unidad_id of [ajena.id, inactiva.id, hijo.id])
      assert.equal((await pedir('/documentos', usuario, { ...alta, unidad_id })).status, 400);
    const unidadMesa = await crear(secretaria, 'Mesa');
    assert.equal((await pedir('/documentos', secretaria, { ...alta, tipo_id: f.tipos.director, unidad_id: unidadMesa.id })).status, 400);
    const registrado = await pedir('/documentos', usuario, { ...alta, unidad_id: a.id });
    assert.equal(registrado.status, 201);
    assert.equal(registrado.body.documento.ubicacion.unidad_id, a.id);
    const { id, revision } = registrado.body.documento;
    const ruta = '/documentos/' + id + '/ubicacion';
    for (const unidad_id of [ajena.id, inactiva.id, hijo.id])
      assert.equal((await pedir(ruta, usuario, { revision, unidad_id })).status, 400);
    assert.equal((await pedir('/documentos/' + id)).body.documento.ubicacion.unidad_id, a.id);
    const cambiado = await pedir(ruta, usuario, { revision, unidad_id: b.id });
    assert.equal(cambiado.status, 200);
    assert.equal(cambiado.body.documento.ubicacion.unidad_id, b.id);
    assert.equal((await pedir(ruta, usuario, { revision, unidad_id: a.id })).status, 409);
    const sinUbicacion = await pedir('/documentos', usuario, alta);
    assert.equal(sinUbicacion.status, 201);
    assert.equal(sinUbicacion.body.documento.ubicacion, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
