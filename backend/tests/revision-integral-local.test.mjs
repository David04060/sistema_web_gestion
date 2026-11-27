/** Archivo: Recorre reglas documentales y administrativas en transacciones que revierten los datos de ensayo.
 */
import './helpers/exigir-aislamiento.mjs';
import { verificarEntornoPrueba, leerFixtures } from './helpers/entorno-prueba.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { app } from '../dist/app.js';
import { pool } from '../dist/config/database.js';
import { generarToken } from '../dist/shared/security/jwt.js';
import { fechaRegistro, periodoRegistro } from '../dist/modules/documentos/fecha-registro.js';
import { pdfDocumental } from '../dist/modules/documentos-pdf/pdf.documental.js';

test('Fechas gregorianas y precisión: día, mes, año; límites imposibles rechazados', () => {
  for (const f of ['2024-02-29', '2026-11-01', '2026-11', '2026', '1900', '1899', '0001', '9999'])
    assert.ok(fechaRegistro.safeParse(f).success, f);
  for (const f of [
    '2026-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-13',
    '2026-00',
    '2026-01-00',
    '2026-1',
    '0000',
    '10000',
    '2026-11-01T00:00:00Z',
  ])
    assert.equal(fechaRegistro.safeParse(f).success, false, f);
  assert.deepEqual(periodoRegistro('2026-11'), { inicio: '2026-11-01', intervalo: '1 month' });
});

test('Sistema nuevo: API y PostgreSQL reales, conservación íntegra mediante rollback', async (t) => {
  const conectar = pool.connect.bind(pool),
    query = pool.query.bind(pool),
    c = await conectar();
  await verificarEntornoPrueba(c);
  const tablas = (
    await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1")
  ).rows.map((r) => r.tablename);
  async function huella() {
    const r = {};
    for (const tabla of tablas)
      r[tabla] = (
        await c.query(
          `SELECT
  count(*)::int n,
  md5(coalesce(string_agg(to_jsonb (t)::text, '' ORDER BY to_jsonb(t)::text),''))
    hash FROM public.${tabla} t`,
        )
      ).rows[0];
    return r;
  }
  const anterior = await huella();
  await c.query('BEGIN');
  pool.query = (sql, ...args) => c.query(sql, ...args);
  pool.connect = async () => ({
    query: (sql, ...args) =>
      c.query(
        sql === 'BEGIN'
          ? 'SAVEPOINT api_revision'
          : sql === 'COMMIT'
            ? 'RELEASE SAVEPOINT api_revision'
            : sql === 'ROLLBACK'
              ? 'ROLLBACK TO SAVEPOINT api_revision'
              : sql,
        ...args,
      ),
    release: () => {},
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  const existentes = (await c.query('SELECT id::text,rol_id FROM usuarios WHERE activo ORDER BY id')).rows;
  const rol = (n) => existentes.find((u) => u.rol_id === n).id;
  const admin = rol(2),
    dir = rol(3),
    sec = rol(4),
    su = rol(1),
    existente = rol(5);
  async function pedir(actor, ruta, method = 'GET', body) {
    const v = (await c.query('SELECT version_autenticacion FROM usuarios WHERE id=$1', [actor])).rows[0];
    const r = await fetch(base + ruta, {
      method,
      headers: {
        Authorization: 'Bearer ' + generarToken(actor, v.version_autenticacion),
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = await r.json();
    assert.notEqual(r.status, 500, JSON.stringify({ ruta, json }));
    return { status: r.status, body: json };
  }
  async function ok(actor, ruta, method = 'GET', body, status = 200) {
    const r = await pedir(actor, ruta, method, body);
    assert.equal(r.status, status, JSON.stringify({ ruta, ...r }));
    return r.body;
  }
  const ids = {},
    motivo = 'PRUEBA REVISIÓN INTEGRAL — rollback',
    marca = randomBytes(4).toString('hex');
  try {
    await t.test(
      'Una cuenta activa por oficina; Usuarios de oficinas distintas conservan ámbitos y catálogos separados',
      async () => {
        ids.oficina = (await ok(admin, '/oficinas', 'POST', { nombre: 'PRUEBA REVISIÓN ' + marca }, 201)).id;
        ids.a = (
          await ok(
            admin,
            '/usuarios',
            'POST',
            {
              nombre: 'PRUEBA REVISIÓN',
              apellido: 'a',
              nombre_usuario: 'revision_' + marca + 'a',
              rol_id: 5,
              oficina_id: ids.oficina,
              contrasena: randomBytes(16).toString('hex'),
            },
            201,
          )
        ).id;
        assert.equal(
          (
            await pedir(admin, '/usuarios', 'POST', {
              nombre: 'PRUEBA REVISIÓN',
              apellido: 'Ocupada',
              nombre_usuario: 'revision_' + marca + '_ocupada',
              rol_id: 5,
              oficina_id: ids.oficina,
              contrasena: randomBytes(16).toString('hex'),
            })
          ).status,
          409,
        );
        ids.oficinaB = (
          await ok(admin, '/oficinas', 'POST', { nombre: 'PRUEBA REVISIÓN B ' + marca }, 201)
        ).id;
        ids.b = (
          await ok(
            admin,
            '/usuarios',
            'POST',
            {
              nombre: 'PRUEBA REVISIÓN',
              apellido: 'b',
              nombre_usuario: 'revision_' + marca + 'b',
              rol_id: 5,
              oficina_id: ids.oficinaB,
              contrasena: randomBytes(16).toString('hex'),
            },
            201,
          )
        ).id;
        ids.sinOficina = (
          await ok(
            admin,
            '/usuarios',
            'POST',
            {
              nombre: 'PRUEBA REVISIÓN',
              apellido: 'Sin oficina',
              nombre_usuario: 'revision_' + marca + '_sin_oficina',
              rol_id: 5,
              oficina_id: null,
              contrasena: randomBytes(16).toString('hex'),
            },
            201,
          )
        ).id;
        assert.equal((await ok(admin, '/usuarios/' + ids.sinOficina)).usuario.oficina_id, null);
        for (const actor of [ids.a, ids.b, sec]) {
          const tipo = (
            await ok(
              actor,
              '/tipos-documentales',
              'POST',
              { nombre: 'PRUEBA REVISIÓN ' + marca, prefijo: 'REVINT' },
              201,
            )
          ).id;
          ids['tipo' + actor] = tipo;
        }
        for (const n of ['a', 'b']) {
          const op = await ok(ids[n], '/documentos/opciones');
          assert.equal(
            op.tipos.some((x) => x.id === ids['tipo' + ids[n === 'a' ? 'b' : 'a']]),
            false,
          );
        }
      },
    );
    await t.test(
      'Registro recibido/emitido, códigos iguales por ámbito y búsqueda completa con paginación',
      async () => {
        for (const actor of [ids.a, ids.b, sec])
          ids['doc' + actor] = (
            await ok(
              actor,
              '/documentos',
              'POST',
              {
                tipo_id: ids['tipo' + actor],
                clasificacion: 'RECIBIDO',
                asunto: 'PRUEBA REVISIÓN INTEGRAL ' + marca,
              },
              201,
            )
          ).documento;
        const docs = [ids['doc' + ids.a], ids['doc' + ids.b], ids['doc' + sec]];
        assert.equal(new Set(docs.map((d) => d.codigo_visible)).size, 1);
        const codigo = docs[0].codigo_visible;
        ids.codigo = codigo;
        assert.equal((await ok(sec, '/documentos?q=' + codigo)).total, 1);
        for (const actor of [dir, su]) {
          const p = await ok(actor, '/documentos?q=' + codigo + '&limite=1');
          assert.equal(p.total, 3);
          assert.equal(p.documentos.length, 1);
          const p2 = await ok(actor, '/documentos?q=' + codigo + '&limite=1&pagina=2');
          assert.equal(p2.total, 3);
          assert.notEqual(p.documentos[0].id, p2.documentos[0].id);
          assert.ok(p.documentos[0].registrado_por_oficina);
        }
        for (const actor of [ids.a, ids.b])
          assert.equal((await ok(actor, '/documentos?q=' + codigo)).total, 1);
        assert.equal((await ok(existente, '/documentos?q=' + codigo)).total, 0);
        const emitido = (
          await ok(
            ids.a,
            '/documentos',
            'POST',
            {
              tipo_id: ids['tipo' + ids.a],
              clasificacion: 'EMITIDO',
              asunto: 'PRUEBA REVISIÓN EMITIDO ' + marca,
            },
            201,
          )
        ).documento;
        assert.equal(emitido.clasificacion, 'EMITIDO');
        for (const clasificacion of ['RECIBIDO', 'EMITIDO']) {
          const d = (
            await ok(
              dir,
              '/documentos',
              'POST',
              { tipo_id: ids['tipo' + sec], clasificacion, asunto: 'PRUEBA REVISIÓN DIRECCIÓN ' + marca },
              201,
            )
          ).documento;
          assert.equal(d.clasificacion, clasificacion);
          assert.equal(d.registrado_por, dir);
        }
      },
    );
    await t.test(
      'Oficina inactiva: altas y nuevas asignaciones rechazadas; asignación existente conservada',
      async () => {
        await ok(admin, '/oficinas/' + ids.oficina + '/actividad', 'POST', { activa: false, motivo });
        const perfil = (await ok(admin, '/usuarios/' + ids.a)).usuario;
        const datos = (u) => ({
          nombre: u.nombre,
          apellido: u.apellido,
          nombre_usuario: u.nombre_usuario,
          email: u.email,
          telefono: u.telefono,
          rol_id: u.rol_id,
          oficina_id: ids.oficina,
          motivo,
        });
        await ok(admin, '/usuarios/' + ids.a, 'PUT', datos(perfil));
        assert.equal(
          (
            await pedir(admin, '/usuarios', 'POST', {
              nombre: 'PRUEBA',
              apellido: 'Inactiva',
              nombre_usuario: 'inactiva_' + marca,
              rol_id: 5,
              oficina_id: ids.oficina,
              contrasena: randomBytes(16).toString('hex'),
            })
          ).status,
          409,
        );
        const otro = (await ok(admin, '/usuarios/' + existente)).usuario;
        assert.equal((await pedir(admin, '/usuarios/' + existente, 'PUT', datos(otro))).status, 409);
        await c.query('SAVEPOINT oficina_inactiva');
        await assert.rejects(
          c.query('UPDATE usuarios SET oficina_id=$2 WHERE id=$1', [existente, ids.oficina]),
          (e) => e.code === 'P0001',
        );
        await c.query('ROLLBACK TO SAVEPOINT oficina_inactiva');
        assert.equal(
          (await c.query('SELECT oficina_id::text FROM usuarios WHERE id=$1', [ids.a])).rows[0].oficina_id,
          ids.oficina,
        );
        await ok(admin, '/oficinas/' + ids.oficina + '/actividad', 'POST', { activa: true, motivo });
      },
    );
    await t.test('Fechas SQL con límites en Perú, combinaciones, conteos y fechas inválidas', async () => {
      const d = ids['doc' + ids.a];
      await c.query('UPDATE documentos SET creado_en=$2 WHERE id=$1', [d.id, '2024-03-01T04:59:59Z']);
      for (const fecha of ['2024', '2024-02', '2024-02-29']) {
        const r = await ok(
          ids.a,
          '/documentos?q=' + marca + '&fecha=' + fecha + '&clasificacion=RECIBIDO&situacion=EN_MI_OFICINA',
        );
        assert.equal(r.total, 1);
        assert.equal(r.documentos[0].id, d.id);
      }
      assert.equal((await ok(ids.a, '/documentos?q=' + marca + '&fecha=2024-03-01')).total, 0);
      for (const fecha of ['2026-02-29', '2026-13', '0000', '2026-11-31'])
        assert.equal((await pedir(dir, '/documentos?fecha=' + fecha)).status, 400);
      for (const fecha of ['0001', '9999'])
        assert.equal((await ok(ids.a, '/documentos?fecha=' + fecha)).total, 0);
      for (const q of ['%', "' OR 1=1 --"]) {
        const r = await ok(ids.a, '/documentos?q=' + encodeURIComponent(q));
        assert.equal(r.total, 0);
      }
    });
    await t.test(
      'Fallos de preparación y confirmación PDF no crean vínculos ni auditoría parcial',
      async () => {
        const d = ids['doc' + sec],
          antes = (await c.query('SELECT count(*)::int n FROM pdf_cargas')).rows[0].n;
        const sinR2 = pdfDocumental(() => ({
          subir: async () => {
            throw Error('PRUEBA fallo de firma');
          },
        }));
        await assert.rejects(
          sinR2.iniciar(sec, d.id, {
            nombre: 'prueba.pdf',
            mime: 'application/pdf',
            tamano: 100,
            revision: null,
          }),
          /PRUEBA fallo/,
        );
        assert.equal((await c.query('SELECT count(*)::int n FROM pdf_cargas')).rows[0].n, antes);
        const fallaValidacion = pdfDocumental(() => ({
          subir: async () => 'https://example.invalid/solo-prueba',
          validarYCopiar: async () => {
            throw Error('PRUEBA fallo de validación');
          },
        }));
        const carga = await fallaValidacion.iniciar(sec, d.id, {
          nombre: 'prueba.pdf',
          mime: 'application/pdf',
          tamano: 100,
          revision: null,
        });
        const eventos = (
          await c.query('SELECT count(*)::int n FROM auditoria_documental WHERE documento_id=$1', [d.id])
        ).rows[0].n;
        await assert.rejects(fallaValidacion.confirmar(sec, d.id, carga.carga), /PRUEBA fallo de validación/);
        assert.equal(
          (await c.query('SELECT count(*)::int n FROM documentos_pdf WHERE documento_id=$1', [d.id])).rows[0]
            .n,
          0,
        );
        assert.equal(
          (await c.query('SELECT count(*)::int n FROM auditoria_documental WHERE documento_id=$1', [d.id]))
            .rows[0].n,
          eventos,
        );
        assert.equal(
          (await c.query('SELECT confirmada_en FROM pdf_cargas WHERE id=$1', [carga.carga])).rows[0]
            .confirmada_en,
          null,
        );
      },
    );
    await t.test(
      'PDF vigente: confirmación idempotente, reemplazo y recolección con fallo y reintento',
      async () => {
        const d = ids['doc' + sec],
          objetos = new Set(),
          borrados = [];
        let fallar = false;
        const pdf = pdfDocumental(() => ({
          subir: async (clave) => {
            objetos.add(clave);
            return 'https://example.invalid/carga-aislada';
          },
          validarYCopiar: async (origen, destino) => {
            assert.ok(objetos.has(origen));
            objetos.add(destino);
          },
          abrir: async (clave) => {
            assert.ok(objetos.has(clave));
            return 'https://example.invalid/lectura-aislada';
          },
          eliminar: async (clave) => {
            if (fallar) throw Error('Fallo simulado de eliminación');
            borrados.push(clave);
            objetos.delete(clave);
          },
        }));
        const primera = await pdf.iniciar(sec, d.id, {
          nombre: 'primero.pdf',
          mime: 'application/pdf',
          tamano: 100,
          revision: null,
        });
        assert.equal((await pdf.confirmar(sec, d.id, primera.carga)).archivo.revision, primera.carga);
        const eventos = (
          await c.query('SELECT count(*)::int n FROM auditoria_documental WHERE documento_id=$1', [d.id])
        ).rows[0].n;
        await pdf.confirmar(sec, d.id, primera.carga);
        assert.equal(
          (await c.query('SELECT count(*)::int n FROM auditoria_documental WHERE documento_id=$1', [d.id]))
            .rows[0].n,
          eventos,
        );
        assert.equal(objetos.size, 1);
        const segunda = await pdf.iniciar(sec, d.id, {
          nombre: 'segundo.pdf',
          mime: 'application/pdf',
          tamano: 100,
          revision: primera.carga,
        });
        const reemplazo = await pdf.confirmar(sec, d.id, segunda.carga);
        assert.equal(reemplazo.archivo.nombre, 'segundo.pdf');
        assert.equal(objetos.size, 1);
        const claveVigente = [...objetos][0];
        assert.ok(!borrados.includes(claveVigente));
        assert.equal((await pdf.abrir(sec, d.id, false)).vence_en, 60);
        await assert.rejects(pdf.eliminar(sec, d.id, primera.carga), (e) => e.status === 409);
        fallar = true;
        const eliminado = await pdf.eliminar(sec, d.id, segunda.carga);
        assert.equal(eliminado.archivo, null);
        assert.equal(eliminado.limpieza_pendiente, 1);
        assert.ok(objetos.has(claveVigente));
        await c.query('UPDATE pdf_objetos_pendientes SET limpiar_desde=clock_timestamp() WHERE clave_r2=$1', [
          claveVigente,
        ]);
        fallar = false;
        assert.deepEqual(await pdf.limpiar(20, d.id), { eliminados: 1, pendientes: 0 });
        assert.equal(objetos.size, 0);
        assert.equal((await pdf.consultar(sec, d.id)).limpieza_pendiente, 0);
        const acciones = (
          await c.query('SELECT accion FROM pdf_eventos WHERE documento_id=$1', [d.id])
        ).rows.map((r) => r.accion);
        assert.ok(acciones.includes('LIMPIEZA_PENDIENTE'));
        assert.ok(acciones.includes('LIMPIEZA_COMPLETADA'));
      },
    );
    await t.test(
      'Lectura institucional sin escritura y aislamiento por API directa, historial y PDF',
      async () => {
        const d = ids['doc' + ids.a];
        for (const ruta of ['', '/historial', '/auditoria', '/pdf'])
          assert.equal((await pedir(sec, '/documentos/' + d.id + ruta)).status, 404);
        for (const actor of [dir]) {
          const r = await ok(actor, '/documentos/' + d.id);
          assert.equal(r.documento.permisos.relacionar, true);
          assert.ok(
            Object.entries(r.documento.permisos)
              .filter(([k]) => k !== 'relacionar')
              .every(([, v]) => !v),
          );
          await ok(actor, '/documentos/' + d.id + '/historial');
          await ok(actor, '/documentos/' + d.id + '/auditoria');
          await ok(actor, '/documentos/' + d.id + '/pdf');
          assert.equal(
            (
              await pedir(actor, '/documentos/' + d.id, 'PUT', {
                revision: d.revision,
                motivo,
                asunto: 'Prohibido',
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await pedir(actor, '/documentos/' + d.id + '/pdf/cargas', 'POST', {
                nombre: 'test.pdf',
                tamano: 100,
                mime: 'application/pdf',
                revision: null,
              })
            ).status,
            403,
          );
        }
        for (const actor of [ids.b, existente, admin])
          for (const ruta of ['', '/historial', '/auditoria', '/pdf'])
            assert.equal((await pedir(actor, '/documentos/' + d.id + ruta)).status, 404);
      },
    );
    await t.test('Ubicaciones propias, padre obligatorio de contenido, rutas y sin oficina', async () => {
      const lugar = (
        await ok(ids.a, '/ubicaciones', 'POST', { clase: 'Lugar', nombre: 'Estante revisión' }, 201)
      ).id;
      const contenido = (
        await ok(
          ids.a,
          '/ubicaciones',
          'POST',
          { clase: 'Archivador', nombre: 'Informes revisión', padre_id: lugar },
          201,
        )
      ).id;
      const d = (
        await ok(
          ids.a,
          '/documentos',
          'POST',
          {
            tipo_id: ids['tipo' + ids.a],
            clasificacion: 'RECIBIDO',
            asunto: 'Ubicación ' + marca,
            unidad_id: contenido,
          },
          201,
        )
      ).documento;
      assert.equal(d.ubicacion.ruta_ubicacion_guardada, 'Estante revisión / Informes revisión');
      assert.equal(
        (await pedir(ids.b, '/ubicaciones', 'POST', { clase: 'Caja', nombre: 'Ajena', padre_id: lugar }))
          .status,
        409,
      );
      assert.equal(
        (
          await pedir(ids.a, '/ubicaciones/' + lugar, 'PUT', {
            clase: 'Lugar',
            nombre: 'Ciclo',
            padre_id: contenido,
          })
        ).status,
        409,
      );
      assert.equal(
        (await pedir(ids.a, '/ubicaciones', 'POST', { clase: 'Lugar', nombre: 'Con oficina' })).status,
        201,
      );
      assert.equal(
        (await pedir(ids.sinOficina, '/ubicaciones', 'POST', { clase: 'Lugar', nombre: 'Sin oficina' }))
          .status,
        409,
      );
      assert.equal(
        (await c.query('SELECT oficina_id FROM usuarios WHERE id=$1', [ids.sinOficina])).rows[0].oficina_id,
        null,
      );
    });
    await t.test(
      'Relacionados conservan identidad; una operación fallida no deja documento ni correlativo',
      async () => {
        const origen = ids['doc' + ids.a];
        const d = (
          await ok(
            ids.a,
            '/documentos',
            'POST',
            {
              tipo_id: ids['tipo' + ids.a],
              clasificacion: 'EMITIDO',
              asunto: 'Relacionado ' + marca,
              origen_id: origen.id,
            },
            201,
          )
        ).documento;
        assert.notEqual(d.id, origen.id);
        assert.equal(d.relacionados[0].id, origen.id);
        const antes = (await c.query('SELECT count(*)::int n FROM documentos')).rows[0].n;
        const correlativo = (
          await c.query('SELECT ultimo_numero FROM correlativos_documentales WHERE tipo_id=$1', [
            ids['tipo' + ids.a],
          ])
        ).rows[0].ultimo_numero;
        assert.equal(
          (
            await pedir(ids.a, '/documentos', 'POST', {
              tipo_id: ids['tipo' + ids.a],
              clasificacion: 'RECIBIDO',
              asunto: 'Fallo',
              valores: [{ campo_id: '99999999', valor: 'Inválido' }],
            })
          ).status,
          400,
        );
        assert.equal((await c.query('SELECT count(*)::int n FROM documentos')).rows[0].n, antes);
        assert.equal(
          (
            await c.query('SELECT ultimo_numero FROM correlativos_documentales WHERE tipo_id=$1', [
              ids['tipo' + ids.a],
            ])
          ).rows[0].ultimo_numero,
          correlativo,
        );
      },
    );
    await t.test(
      'Delegación personal: destinatario consulta sin trasladar autoría ni permisos de escritura',
      async () => {
        const d = (await ok(ids.a, '/documentos/' + ids['doc' + ids.a].id)).documento;
        const r = (
          await ok(ids.a, '/documentos/' + d.id + '/delegar', 'POST', {
            revision: d.revision,
            usuario_id: ids.b,
            oficina_id: ids.oficinaB,
          })
        ).documento;
        assert.equal(r.ambito_id, d.ambito_id);
        assert.equal(r.registrado_por, ids.a);
        assert.equal(r.situacion, 'DELEGADO');
        const receptor = (await ok(ids.b, '/documentos/' + d.id)).documento;
        assert.ok(receptor.delegado_por_nombre);
        assert.ok(Object.values(receptor.permisos).every((v) => !v));
        assert.equal((await ok(ids.a, '/documentos/' + d.id + '/pdf')).modificar, true);
        for (const [ruta, body] of [
          ['/delegar', { revision: r.revision, nombre: 'Otra persona' }],
          ['/anular', { revision: r.revision, motivo }],
        ])
          assert.equal((await pedir(ids.b, '/documentos/' + d.id + ruta, 'POST', body)).status, 403);
        assert.equal(
          (
            await pedir(ids.a, '/documentos/' + d.id, 'PUT', {
              revision: r.revision,
              motivo,
              asunto: 'Prohibido',
            })
          ).status,
          403,
        );
      },
    );
    await t.test(
      'Secretaría conserva y delega manualmente; Dirección guarda o delega; PDF compartido',
      async () => {
        const d = (
          await ok(
            sec,
            '/documentos',
            'POST',
            {
              tipo_id: ids['tipo' + sec],
              clasificacion: 'EMITIDO',
              asunto: 'Conservado ' + marca,
              conservar_en_mesa: true,
            },
            201,
          )
        ).documento;
        const r = (
          await ok(sec, '/documentos/' + d.id + '/delegar', 'POST', {
            revision: d.revision,
            nombre: 'Persona manual sin cuenta',
          })
        ).documento;
        assert.equal(r.registrado_por, sec);
        assert.equal(r.delegacion.nombre_persona_guardado, 'Persona manual sin cuenta');
        for (const actor of [sec, dir])
          assert.equal((await ok(actor, '/documentos/' + d.id + '/pdf')).modificar, true);
        const pendiente = ids['doc' + sec];
        for (const body of [
          { revision: pendiente.revision },
          { revision: pendiente.revision, oficina_id: ids.oficina },
          {
            revision: pendiente.revision,
            usuario_id: ids.b,
            oficina_id: leerFixtures().oficinas['Dirección'],
          },
        ])
          assert.equal(
            (await pedir(dir, '/documentos/' + pendiente.id + '/delegar', 'POST', body)).status,
            400,
          );
        const unidad = (
          await ok(dir, '/ubicaciones', 'POST', { clase: 'Lugar', nombre: 'Caja Dirección revisión' }, 201)
        ).id;
        const guardado = (
          await ok(dir, '/documentos/' + pendiente.id + '/ubicacion', 'POST', {
            revision: pendiente.revision,
            unidad_id: unidad,
          })
        ).documento;
        assert.equal(guardado.situacion, 'GUARDADO_DIRECCION');
      },
    );
    await t.test('Anulación lógica: solo Superadministrador consulta, sin perder historia', async () => {
      const d = (
        await ok(
          ids.a,
          '/documentos',
          'POST',
          { tipo_id: ids['tipo' + ids.a], clasificacion: 'RECIBIDO', asunto: 'Anulación sintética ' + marca },
          201,
        )
      ).documento;
      const vinculado = (
        await ok(
          ids.a,
          '/documentos',
          'POST',
          {
            tipo_id: ids['tipo' + ids.a],
            clasificacion: 'EMITIDO',
            asunto: 'Vínculo conservado ' + marca,
            origen_id: d.id,
          },
          201,
        )
      ).documento;
      const actual = (await ok(ids.a, '/documentos/' + d.id)).documento;
      await ok(ids.a, '/documentos/' + d.id + '/anular', 'POST', { revision: actual.revision, motivo });
      for (const actor of [ids.a, ids.b, dir, sec, admin]) {
        assert.equal((await pedir(actor, '/documentos/' + d.id)).status, 404);
        assert.equal((await pedir(actor, '/documentos?situacion=ANULADO')).status, 403);
      }
      const r = (await ok(su, '/documentos/' + d.id)).documento;
      assert.equal(r.situacion, 'ANULADO');
      assert.ok(Object.values(r.permisos).every((v) => !v));
      await ok(su, '/documentos/' + d.id + '/auditoria');
      assert.equal(
        (
          await c.query(
            'SELECT count(*)::int n FROM documentos_relaciones WHERE documento_id=$1 AND origen_id=$2',
            [vinculado.id, d.id],
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        (await ok(ids.a, '/documentos/' + vinculado.id)).documento.relacionados.some((x) => x.id === d.id),
        false,
      );
    });
  } finally {
    pool.connect = conectar;
    pool.query = query;
    await c.query('ROLLBACK');
    assert.deepEqual(await huella(), anterior);
    c.release();
    await new Promise((r) => server.close(r));
    await pool.end();
  }
});
