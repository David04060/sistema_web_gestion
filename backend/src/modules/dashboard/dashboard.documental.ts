import type {PoolClient} from 'pg';
import {pool} from '../../config/database.js';
import {actorActual, lecturaSQL, type Actor} from '../../shared/documental/nucleo.js';
import {HttpError} from '../../shared/http/HttpError.js';

type Conexion = Pick<PoolClient, 'query'>;
interface Conteo {etiqueta:string; total:number}
interface Mes {mes:string; total:number; vigentes:number; anulados:number}
interface Periodo {desde:string; hasta:string; mes_actual_parcial:boolean}
interface Grupo {clave:string; etiqueta:string; total:number; vigentes:number; anulados:number; situaciones:Conteo[]; tipos:Conteo[]; meses:Mes[]}
interface Contexto {zona_horaria:string; actualizado:string; periodo:Periodo}

async function contexto(c:Conexion, referencia?:Date):Promise<Contexto> {
 const {rows:[r]}=await c.query<{desde:Date;hasta:Date}>(`SELECT
  (date_trunc('month', t AT TIME ZONE 'America/Lima') - interval '11 months') AT TIME ZONE 'America/Lima' desde, t hasta
  FROM (SELECT COALESCE($1::timestamptz,transaction_timestamp()) t) reloj`,[referencia??null]);
 return {zona_horaria:'America/Lima',actualizado:r.hasta.toISOString(),periodo:{desde:r.desde.toISOString(),hasta:r.hasta.toISOString(),mes_actual_parcial:true}};
}

async function administracion(c:Conexion,a:Actor) {
 const valores=[a.rol_id];
 const cuentas_por_rol=(await c.query<Conteo>(`SELECT r.codigo etiqueta,count(u.id)::int total
  FROM roles r LEFT JOIN usuarios u ON u.rol_id=r.id
  WHERE ($1::smallint=1 OR r.id<>1) GROUP BY r.id,r.codigo ORDER BY r.id`,valores)).rows;
 const {rows:[cuentas]}=await c.query<{activas:number;inactivas:number}>(`SELECT count(*) FILTER(WHERE activo)::int activas,
  count(*) FILTER(WHERE NOT activo)::int inactivas FROM usuarios WHERE ($1::smallint=1 OR rol_id<>1)`,valores);
 const {rows:[oficinas]}=await c.query<{activas:number;inactivas:number}>('SELECT count(*) FILTER(WHERE activa)::int activas,count(*) FILTER(WHERE NOT activa)::int inactivas FROM oficinas');
 const nombres:Record<string,string>={SUPERADMINISTRADOR:'Superadministrador',ADMINISTRADOR:'Administrador',DIRECTOR:'Director(a)',SECRETARIA_DIRECCION:'Secretaria de Dirección',USUARIO:'Usuario'};
 return {cuentas_por_rol:cuentas_por_rol.map(r=>({...r,etiqueta:nombres[r.etiqueta]??r.etiqueta})),actividad_cuentas:[{etiqueta:'Activas',total:cuentas.activas},{etiqueta:'Inactivas',total:cuentas.inactivas}],actividad_oficinas:[{etiqueta:'Activas',total:oficinas.activas},{etiqueta:'Inactivas',total:oficinas.inactivas}]};
}

async function grupoDocumental(c:Conexion,a:Actor,contexto:Contexto,clave:string,etiqueta:string,filtro:string):Promise<Grupo> {
 const valores=[a.id,a.rol_id,a.ambito_id];
 const condicion=`${lecturaSQL} AND (${filtro})`;
 const {rows:[resumen]}=await c.query<{total:number;vigentes:number;anulados:number}>(`SELECT count(*)::int total,
  count(*) FILTER(WHERE d.situacion<>'ANULADO')::int vigentes,count(*) FILTER(WHERE d.situacion='ANULADO')::int anulados
  FROM documentos d WHERE ${condicion}`,valores);
 const situaciones=(await c.query<Conteo>(`SELECT d.situacion etiqueta,count(*)::int total FROM documentos d WHERE ${condicion} GROUP BY d.situacion ORDER BY d.situacion`,valores)).rows;
 const tipos=(await c.query<Conteo>(`SELECT d.tipo_nombre_guardado etiqueta,count(*)::int total FROM documentos d
  WHERE ${condicion} AND d.situacion<>'ANULADO' GROUP BY d.tipo_nombre_guardado ORDER BY total DESC,d.tipo_nombre_guardado`,valores)).rows;
 const meses=(await c.query<Mes>(`WITH meses AS (
  SELECT generate_series($4::timestamptz AT TIME ZONE 'America/Lima',date_trunc('month',$5::timestamptz AT TIME ZONE 'America/Lima'),interval '1 month') mes
 ), visibles AS (SELECT d.id,d.situacion,date_trunc('month',d.creado_en AT TIME ZONE 'America/Lima') mes
  FROM documentos d WHERE ${condicion} AND d.creado_en >= $4::timestamptz AND d.creado_en <= $5::timestamptz)
 SELECT to_char(m.mes,'YYYY-MM') mes,count(d.id)::int total,
  count(d.id) FILTER(WHERE d.situacion<>'ANULADO')::int vigentes,
  count(d.id) FILTER(WHERE d.situacion='ANULADO')::int anulados
 FROM meses m LEFT JOIN visibles d ON d.mes=m.mes GROUP BY m.mes ORDER BY m.mes`,[...valores,contexto.periodo.desde,contexto.periodo.hasta])).rows;
 return {clave,etiqueta,...resumen,situaciones,tipos,meses};
}

/** Solo agregados autorizados. La rama administrativa no consulta documentos. */
export async function consultarDashboard(c:Conexion,a:Actor,referencia?:Date) {
 if(![1,2,3,4,5].includes(a.rol_id)||!a.activo)throw new HttpError(403,'Perfil no autorizado');
 const reloj=await contexto(c,referencia);
 if(a.rol_id===1||a.rol_id===2) {
  const datosAdministrativos=await administracion(c,a);
  const usuarios=datosAdministrativos.cuentas_por_rol.reduce((n,r)=>n+r.total,0);
  const oficinas=datosAdministrativos.actividad_oficinas.reduce((n,r)=>n+r.total,0);
  if(a.rol_id===2)return {alcance:'administrativo' as const,usuarios,oficinas,estadisticas:{...reloj,administracion:datosAdministrativos}};
  const global=await grupoDocumental(c,a,reloj,'global','Todos los ámbitos autorizados','true');
  return {alcance:'global' as const,usuarios,oficinas,documentos:global.situaciones.map(r=>({situacion:r.etiqueta,total:r.total})),estadisticas:{...reloj,administracion:datosAdministrativos,grupos_documentales:[global]}};
 }
 const valores=[a.id,a.rol_id,a.ambito_id];
 const estados=(await c.query(`SELECT d.situacion,count(*)::int total FROM documentos d WHERE ${lecturaSQL} GROUP BY d.situacion ORDER BY d.situacion`,valores)).rows;
 const recientes=(await c.query(`SELECT d.id::text,d.codigo_visible,d.asunto,d.situacion,d.creado_en FROM documentos d WHERE ${lecturaSQL} ORDER BY d.creado_en DESC,d.id DESC LIMIT 8`,valores)).rows;
 const grupos:Grupo[]=[];
 if(a.rol_id===5)grupos.push(await grupoDocumental(c,a,reloj,'personal','Tu ámbito personal','d.ambito_id=$3::bigint'));
 else {
  grupos.push(await grupoDocumental(c,a,reloj,'compartido','Ámbito compartido de Dirección y Secretaría','d.ambito_id=$3::bigint'));
  if(a.rol_id===3)grupos.push(await grupoDocumental(c,a,reloj,'personales_ajenos','Ámbitos personales ajenos · solo lectura','d.ambito_id<>$3::bigint'));
 }
 return {alcance:a.rol_id===5?'personal' as const:'institucional' as const,estados,recientes,estadisticas:{...reloj,grupos_documentales:grupos}};
}

/** Identidad y todas las cifras se leen en una misma instantánea de solo lectura. */
export async function dashboardActual(id:string) {
 const c=await pool.connect();
 try {
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const actor=await actorActual(c,id);
  const resultado=await consultarDashboard(c,actor);
  await c.query('COMMIT');
  return resultado;
 } catch(e) {await c.query('ROLLBACK');throw e;} finally {c.release();}
}
