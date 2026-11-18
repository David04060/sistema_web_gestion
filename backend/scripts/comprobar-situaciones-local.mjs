import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import ExcelJS from 'exceljs';
import { env, perfilNeon } from '../dist/config/env.js';
import { pool } from '../dist/config/database.js';
import { verificarConexionLocal } from '../dist/config/local.js';
import { generarToken } from '../dist/shared/security/jwt.js';

// Solo lectura: usa la API ya levantada y la base habitual; nunca inicia servidores.
assert.equal(perfilNeon, false);
const cliente = await pool.connect();
try {
  console.log(await verificarConexionLocal(cliente, env.DATABASE_URL));
  await cliente.query('BEGIN READ ONLY');
  const { rows: actores } = await cliente.query(
    'SELECT id::text,rol_id,version_autenticacion FROM usuarios WHERE activo ORDER BY rol_id'
  );
  const { rows: documentos } = await cliente.query(`SELECT d.id::text,d.registrado_por::text,
    d.codigo_visible,d.asunto,d.situacion,e.usuario_indicado_id::text,
    to_char(d.creado_en AT TIME ZONE 'America/Lima','YYYY-MM') mes
    FROM documentos d LEFT JOIN delegaciones_documento e ON e.documento_id=d.id`);
  const etiquetas = {
    PERSONAL:'Personal',EN_MI_OFICINA:'En mi oficina',DELEGADO_A_MI:'Delegado a mí',
    DELEGADO_POR_MI:'Delegado por mí',ANULADO:'Anulado',
    PENDIENTE_DIRECCION:'Pendiente de Dirección',EN_MESA_DE_PARTES:'En Mesa de Partes',
    GUARDADO_DIRECCION:'Guardado en Dirección',
  };
  const ordenar = (ids) => [...ids].sort();
  for (const a of actores) {
    const pedir = (ruta, opciones) => fetch(`http://127.0.0.1:${env.PORT}/api${ruta}`, {
      ...opciones,
      headers: {Authorization:'Bearer '+generarToken(a.id,a.version_autenticacion),'Content-Type':'application/json'},
      redirect:'error',
    });
    const ok = async (ruta) => {
      const r = await pedir(ruta);
      assert.equal(r.status,200,ruta);
      return r.json();
    };
    const { rows: alcance } = await cliente.query(
      'SELECT id::text FROM documentos WHERE public.documento_consultable_con_delegacion($1,id)', [a.id]
    );
    const esperados = new Set(alcance.map(d=>d.id));
    const { rows: archivo } = await cliente.query(`SELECT h.documento_id::text id
      FROM documentos_oficina h JOIN oficina_periodos anterior ON anterior.id=h.periodo_id
      JOIN oficina_periodos vigente ON vigente.oficina_id=anterior.oficina_id AND vigente.fin IS NULL
      JOIN usuarios u ON u.id=vigente.usuario_id AND u.oficina_id=vigente.oficina_id
      WHERE anterior.fin IS NOT NULL AND u.id=$1`,[a.id]);
    const historicos = new Set(archivo.map(d=>d.id));
    if(a.rol_id===1) assert.equal(esperados.size,documentos.length);
    if(a.rol_id===2) assert.equal(esperados.size,0);
    if(a.rol_id===5) {
      const ajenos = documentos.filter(d=>d.registrado_por!==a.id && d.usuario_indicado_id!==a.id && !historicos.has(d.id));
      assert.ok(ajenos.some(d=>d.situacion==='DELEGADO'));
      assert.ok(ajenos.every(d=>!esperados.has(d.id)));
    }
    const lista = (await ok('/documentos?limite=100')).documentos;
    if(a.rol_id===1) lista.push(...(await ok('/documentos?limite=100&situacion=ANULADO')).documentos);
    assert.deepEqual(ordenar(lista.map(d=>d.id)),ordenar(esperados));
    const inicio = await ok('/dashboard');
    const estados = inicio.estados ?? inicio.documentos ?? [];
    const cuentas = Object.create(null);
    for(const d of lista) cuentas[d.situacion_cuenta]=(cuentas[d.situacion_cuenta]??0)+1;
    assert.deepEqual(Object.fromEntries(estados.map(e=>[e.situacion,e.total])),{...cuentas});
    for(const situacion of Object.keys(cuentas)){
      const filtrados=(await ok('/documentos?limite=100&situacion='+situacion)).documentos;
      assert.deepEqual(ordenar(filtrados.map(d=>d.id)),ordenar(lista.filter(d=>d.situacion_cuenta===situacion).map(d=>d.id)));
    }
    for(const d of documentos) {
      const r=await pedir('/documentos/'+d.id);
      if(esperados.has(d.id)){
        assert.equal(r.status,200);
        const {documento} = await r.json();
        assert.equal(documento.situacion_cuenta,lista.find(f=>f.id===d.id).situacion_cuenta);
        if(d.situacion==='PERSONAL' && d.registrado_por!==a.id)
          assert.equal(documento.situacion_cuenta,historicos.has(d.id)?'EN_MI_OFICINA':'PERSONAL');
        if(d.situacion==='DELEGADO' && d.usuario_indicado_id===a.id && d.registrado_por!==a.id){
          assert.equal(documento.situacion_cuenta,'DELEGADO_A_MI');
          assert.ok(Object.values(documento.permisos).every(x=>x===false));
          const pdf=await ok('/documentos/'+d.id+'/pdf');
          assert.equal(pdf.modificar,false);
          assert.equal(pdf.eliminar,false);
          assert.deepEqual(await ok('/documentos/'+d.id+'/historial'),{historial:[]});
          assert.deepEqual(await ok('/documentos/'+d.id+'/auditoria'),{eventos:[]});
        }
      }else{
        assert.equal(r.status,404);
        assert.deepEqual(Object.keys(await r.json()),['error']);
        assert.equal((await pedir('/documentos/'+d.id+'/pdf')).status,404);
      }
    }
    for(const periodo of new Set(documentos.map(d=>d.mes))){
      const [anio,mes]=periodo.split('-');
      const r=await pedir(`/documentos/exportar-excel?anio=${anio}&mes=${mes}`);
      if(a.rol_id===2){assert.equal(r.status,403);continue;}
      assert.equal(r.status,200);
      const libro=new ExcelJS.Workbook();
      await libro.xlsx.load(Buffer.from(await r.arrayBuffer()));
      const filas=[];
      libro.getWorksheet('Documentos').eachRow((row,i)=>{
        if(i>1) filas.push(JSON.stringify([row.getCell(1).value,row.getCell(3).value,row.getCell(8).value]));
      });
      const esperado=documentos.filter(d=>d.mes===periodo&&esperados.has(d.id)).map(d=>{
        const etiqueta=etiquetas[lista.find(f=>f.id===d.id).situacion_cuenta];
        assert.ok(etiqueta);
        return JSON.stringify([d.codigo_visible,d.asunto,etiqueta]);
      });
      assert.deepEqual(ordenar(filas),ordenar(esperado));
    }
    assert.equal((await pedir('/documentos?situacion=CON_DELEGACION')).status,400);
    console.log(`Rol ${a.rol_id}: ${esperados.size} documentos; SQL, API, Inicio, filtros y Excel coinciden.`);
  }
} finally {
  await cliente.query('ROLLBACK');
  cliente.release();
  await pool.end();
}
