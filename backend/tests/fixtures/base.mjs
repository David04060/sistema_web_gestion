import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,randomInt,randomUUID} from 'node:crypto';
import pg from 'pg';
import {verificarEntornoPrueba,antesDeEscribir} from '../helpers/entorno-prueba.mjs';

/** Datos sintéticos nuevos; jamás consulta ni copia cuentas o documentos de trabajo. */
export async function crearFixtures(){
 const offset=process.env.POSTGRES_TEST_ID_BASE?Number(process.env.POSTGRES_TEST_ID_BASE):randomInt(1000,9000);
 if(!Number.isSafeInteger(offset)||offset<100||offset>10000000)throw Error('POSTGRES_TEST_ID_BASE inválido');
 const m=await verificarEntornoPrueba(),c=new pg.Client({connectionString:process.env.DATABASE_URL});
 const {generarHash}=await import('../../dist/shared/security/password.js');
 const {pool}=await import('../../dist/config/database.js');
 const documentos=await import('../../dist/modules/documentos/documentos.operaciones.js');
 await c.connect();
 const fixture={cuentas:{},tipos:{},documentos:{},oficinas:{},offset};
 try{
  await antesDeEscribir(c,async()=>{
   for(const table of ['usuarios','documentos','tipos_documentales','ambitos_registro','oficinas']){
    const seq=(await c.query('SELECT pg_get_serial_sequence($1,$2) secuencia',[table,'id'])).rows[0].secuencia;
    await c.query('SELECT setval($1::regclass,$2,false)',[seq,offset]);
   }
   for(const o of (await c.query('SELECT id::text,nombre FROM oficinas')).rows)fixture.oficinas[o.nombre]=o.id;
   fixture.oficinas.personal=(await c.query("INSERT INTO oficinas(nombre) VALUES('Oficina sintética de pruebas') RETURNING id::text")).rows[0].id;
   const shared=(await c.query("SELECT id::text FROM ambitos_registro WHERE clase='COMPARTIDO_DIRECCION'")).rows[0].id;
   const hash=await generarHash(randomBytes(32).toString('hex'));
   for(const [key,rol,office]of [['superadmin',1,null],['admin',2,null],['director',3,fixture.oficinas['Dirección']],['secretaria',4,fixture.oficinas['Mesa de Partes']],['usuario',5,fixture.oficinas.personal],['sinOficina',5,null]]){
    const u=(await c.query('INSERT INTO usuarios(nombre,apellido,nombre_usuario,contrasena_hash,rol_id,oficina_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id::text,rol_id,oficina_id::text,version_autenticacion',['Fixture',key,'fixture_'+key+'_'+randomBytes(5).toString('hex'),hash,rol,office])).rows[0];
    fixture.cuentas[key]=u;
    if(rol>=3){const ambito=rol===5?(await c.query("INSERT INTO ambitos_registro(clase,titular_id) VALUES('PERSONAL',$1) RETURNING id::text",[u.id])).rows[0].id:shared;await c.query('INSERT INTO miembros_ambito(usuario_id,ambito_id) VALUES($1,$2)',[u.id,ambito]);u.ambito_id=ambito;}
   }
   for(const key of ['director','usuario','sinOficina']){const u=fixture.cuentas[key];fixture.tipos[key]=(await c.query("INSERT INTO tipos_documentales(ambito_id,nombre,prefijo,creado_por) VALUES($1,'Tipo sintético','BASEQA',$2) RETURNING id::text",[u.ambito_id,u.id])).rows[0].id;}
  });
  const registrar=async(key,actor,extra={})=>{
   await verificarEntornoPrueba(c);
   const a=fixture.cuentas[actor],tipo=fixture.tipos[actor]??fixture.tipos.director;
   const d=(await documentos.registrar(a.id,documentos.alta.parse({tipo_id:tipo,clasificacion:'RECIBIDO',asunto:'Fixture autónomo '+key,...extra}))).documento;
   fixture.documentos[key]=d;return d;
  };
  await registrar('pendiente','director');
  const delegado=await registrar('delegado','director');
  fixture.delegacion={revisionAnterior:delegado.revision};
  fixture.documentos.delegado=(await documentos.delegar(fixture.cuentas.director.id,delegado.id,documentos.delegacion.parse({revision:delegado.revision,usuario_id:fixture.cuentas.sinOficina.id}))).documento;
  const personal=await registrar('personal','usuario');
  await registrar('otroPersonal','sinOficina');
  await registrar('secretaria','secretaria',{conservar_en_mesa:true});
  const anulado=await registrar('anulado','usuario');
  await documentos.anular(fixture.cuentas.usuario.id,anulado.id,{revision:anulado.revision,motivo:'Fixture de anulación'});
  await antesDeEscribir(c,async()=>{
   await c.query('BEGIN');
   try{await c.query("SELECT set_config('app.actor_id',$1,true),set_config('app.motivo','Fixture PDF sin objeto R2',true)",[fixture.cuentas.usuario.id]);
    await c.query("INSERT INTO documentos_pdf(documento_id,revision,clave_r2,nombre,tamano_bytes,tipo_mime,actualizado_por) VALUES($1,$2,'fixture/sin-objeto.pdf','fixture.pdf',127,'application/pdf',$3)",[personal.id,randomUUID(),fixture.cuentas.usuario.id]);await c.query('COMMIT');
   }catch(e){await c.query('ROLLBACK');throw e;}
  });
  fs.writeFileSync(path.join(m.raiz,'fixtures.json'),JSON.stringify(fixture),{mode:0o600});
  return {cuentas:6,documentos:6,offset};
 }finally{await c.end();await pool.end();}
}
