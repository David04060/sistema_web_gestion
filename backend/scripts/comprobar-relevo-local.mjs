import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { env, perfilNeon } from '../dist/config/env.js';
import { verificarConexionLocal } from '../dist/config/local.js';
import { pool } from '../dist/config/database.js';
import * as documentos from '../dist/modules/documentos/documentos.operaciones.js';
import * as administracion from '../dist/modules/usuarios/administracion.operaciones.js';
import { opcionesRelevo, relevarOficina } from '../dist/modules/usuarios/relevo.operaciones.js';
import { pdfDocumental } from '../dist/modules/documentos-pdf/pdf.documental.js';

assert.equal(perfilNeon, false);
const cliente = await pool.connect();
const conectar = pool.connect;
const estado = async () => {
  const tablas = (await cliente.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1")).rows;
  const huellas = {};
  for (const { tablename } of tablas) {
    assert.match(tablename, /^[a-z_]+$/);
    huellas[tablename] = (await cliente.query(
      `SELECT md5(coalesce(string_agg(to_jsonb(t)::text,chr(10) ORDER BY to_jsonb(t)::text),'')) huella FROM public.${tablename} t`,
    )).rows[0].huella;
  }
  return huellas;
};
const pdf = pdfDocumental(() => ({
  subir: async () => 'https://storage.invalid/carga',
  validarYCopiar: async () => {},
  abrir: async () => 'https://storage.invalid/archivo',
}));
const denegado = (status) => (error) => error.status === status;

try {
  console.log(await verificarConexionLocal(cliente, env.DATABASE_URL));
  const antes = await estado();
  await cliente.query('BEGIN');
  // Los servicios conservan su lógica transaccional dentro de un único rollback.
  pool.connect = async () => ({
    release() {},
    async query(sql, ...args) {
      if (sql === 'BEGIN') return cliente.query('SAVEPOINT servicio_local');
      if (sql === 'COMMIT') return cliente.query('RELEASE SAVEPOINT servicio_local');
      if (sql === 'ROLLBACK') {
        await cliente.query('ROLLBACK TO SAVEPOINT servicio_local');
        return cliente.query('RELEASE SAVEPOINT servicio_local');
      }
      return cliente.query(sql, ...args);
    },
  });
  try {
    const { rows: [saliente] } = await cliente.query(`SELECT u.id::text,u.oficina_id::text,
      u.version_autenticacion FROM usuarios u JOIN oficinas o ON o.id=u.oficina_id
      WHERE u.activo AND u.rol_id=5 AND o.activa ORDER BY u.id LIMIT 1`);
    const { rows: [admin] } = await cliente.query('SELECT id::text FROM usuarios WHERE activo AND rol_id=1 LIMIT 1');
    assert.ok(saliente && admin);
    const sufijo = randomUUID().slice(0,8);
    const crear = async (alias) => administracion.crearUsuario(admin.id, administracion.usuarioAlta.parse({
      nombre: 'Prueba', apellido: 'Relevo', nombre_usuario: alias+sufijo, rol_id: 5,
      oficina_id: null, contrasena: randomUUID(),
    }));
    const reemplazo = await crear('qa_reemplazo_');
    const tercero = await crear('qa_tercero_');
    const unidad = await administracion.crearUnidad(saliente.id,{clase:'Estante',nombre:'Prueba '+sufijo,padre_id:null});
    const { tipos } = await documentos.opciones(saliente.id);
    const { documento: original } = await documentos.registrar(saliente.id, documentos.alta.parse({
      tipo_id:tipos[0].id,clasificacion:'RECIBIDO',asunto:'Prueba reversible de relevo',unidad_id:unidad.id,
    }));
    const carga = await pdf.iniciar(saliente.id,original.id,{revision:null,nombre:'prueba.pdf',tamano:127,mime:'application/pdf'});
    await pdf.confirmar(saliente.id,original.id,carga.carga);
    await assert.rejects(documentos.detalle(reemplazo.id,original.id),denegado(404));
    const opciones = await opcionesRelevo(admin.id,saliente.oficina_id);
    await relevarOficina(admin.id,saliente.oficina_id,{
      saliente_id:saliente.id,reemplazo_id:reemplazo.id,version_saliente:saliente.version_autenticacion,
      version_reemplazo:opciones.candidatos.find(u=>u.id===reemplazo.id).version_autenticacion,
      motivo:'Prueba reversible de relevo',
    });
    const { rows: [acceso] } = await cliente.query(`SELECT
      public.documento_consultable($1,$4) reemplazo, public.documento_consultable_con_delegacion($2,$4) tercero,
      (SELECT activo FROM usuarios WHERE id=$3) saliente`,[reemplazo.id,tercero.id,saliente.id,original.id]);
    assert.deepEqual(acceso,{reemplazo:true,tercero:false,saliente:false});
    const { documento } = await documentos.detalle(reemplazo.id,original.id);
    assert.equal(documento.historico_solo_lectura,true);
    assert.equal(documento.ubicacion.unidad_id,unidad.id);
    assert.equal(documento.situacion_cuenta,'EN_MI_OFICINA');
    assert.ok((await documentos.historial(reemplazo.id,original.id)).historial.length);
    assert.ok((await documentos.listar(reemplazo.id,documentos.filtros.parse({situacion:'EN_MI_OFICINA'}))).documentos.some(d=>d.id===original.id));
    assert.ok((await pdf.consultar(reemplazo.id,original.id)).archivo);
    assert.equal((await pdf.abrir(reemplazo.id,original.id,false)).url,'https://storage.invalid/archivo');
    assert.equal((await administracion.unidades(reemplazo.id)).unidades.length,0);
    for (const permiso of ['corregir','ubicar','delegar','anular','pdf']) assert.equal(documento.permisos[permiso],false);
    await assert.rejects(documentos.detalle(tercero.id,original.id),denegado(404));
    await assert.rejects(pdf.abrir(tercero.id,original.id,false),denegado(404));
    await assert.rejects(pdf.iniciar(reemplazo.id,original.id,{revision:null,nombre:'prueba.pdf',tamano:127,mime:'application/pdf'}),denegado(403));
    await assert.rejects(documentos.ubicar(reemplazo.id,original.id,{revision:documento.revision,unidad_id:unidad.id}),denegado(403));
    await assert.rejects(documentos.anular(reemplazo.id,original.id,{revision:documento.revision,motivo:'Prueba'}),denegado(403));
    await assert.rejects(documentos.delegar(reemplazo.id,original.id,{revision:documento.revision,usuario_id:tercero.id}),denegado(403));
    console.log('Relevo, lectura histórica, ubicación, historial, PDF simulado, rechazo a tercero y bloqueo de escritura verificados.');

    const { rows: institucionales } = await cliente.query('SELECT id::text,rol_id FROM usuarios WHERE activo AND rol_id IN (3,4) AND oficina_id IS NOT NULL ORDER BY rol_id');
    assert.equal(institucionales.length,2);
    for (const emisor of [...institucionales,{id:reemplazo.id,rol_id:5}]) {
      const { tipos: tiposEmisor } = await documentos.opciones(emisor.id);
      const { documento: delegado } = await documentos.registrar(emisor.id,documentos.alta.parse({
        tipo_id:tiposEmisor[0].id,clasificacion:'RECIBIDO',asunto:'Prueba reversible de delegación',
        conservar_en_mesa:emisor.rol_id===4,destino:{usuario_id:tercero.id},
      }));
      assert.equal(delegado.situacion_cuenta,'DELEGADO_POR_MI');
      const { documento: recibido } = await documentos.detalle(tercero.id,delegado.id);
      assert.equal(recibido.situacion_cuenta,'DELEGADO_A_MI');
      assert.ok(Object.values(recibido.permisos).every(puede=>!puede));
      await documentos.anular(emisor.id,delegado.id,{revision:delegado.revision,motivo:'Prueba reversible de revocación'});
      await assert.rejects(documentos.detalle(tercero.id,delegado.id),denegado(404));
      await assert.rejects(pdf.abrir(tercero.id,delegado.id,false),denegado(404));
    }
    console.log('Delegación y revocación verificadas para Dirección, Secretaría y Usuario.');
  } finally {
    pool.connect = conectar;
    await cliente.query('ROLLBACK');
    assert.deepEqual(await estado(),antes);
    console.log('Filas restauradas mediante rollback.');
  }
} finally {
  cliente.release();
  await pool.end();
}
