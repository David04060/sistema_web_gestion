import type { PoolClient } from 'pg';
import type { Crear, Filtros, Metadatos, Paginacion } from './archivos.schema.js';

export interface Archivo {
    id: string;
    nombre: string;
    responsabilidad: string;
    oficina_id: string;
    oficina: string;
    creado_por_id: string;
    creador: string;
    fecha_creacion: string;
    motivo: string;
    asignacion_id: string;
    responsable_id: string;
    responsable: string;
    fecha_inicio: string;
}
export interface Asignacion {
    id: string;
    responsable_id: string;
    responsable: string;
    fecha_inicio: string;
    fecha_fin: string | null;
    formalizado_por_id: string;
    formalizador: string;
    motivo: string;
    finalizado_por_id: string | null;
    finalizador: string | null;
    motivo_fin: string | null;
}
const columnas = `a.id::text,a.nombre,a.responsabilidad,a.oficina_id::text,o.nombre oficina,
 a.creado_por_id::text,concat_ws(' ',creador.nombre,creador.apellido) creador,to_jsonb(a.fecha_creacion)#>>'{}' fecha_creacion,a.motivo,
 s.id::text asignacion_id,s.responsable_id::text,concat_ws(' ',u.nombre,u.apellido) responsable,
 to_jsonb(s.fecha_inicio)#>>'{}' fecha_inicio`;
const relaciones = `FROM archivos_institucionales a JOIN oficinas o ON o.id=a.oficina_id
 JOIN usuarios creador ON creador.id=a.creado_por_id
 JOIN archivos_asignaciones s ON s.archivo_id=a.id AND s.fecha_fin IS NULL
 JOIN usuarios u ON u.id=s.responsable_id`;

/** Página y total administrativos en una sola sentencia y sin relaciones documentales. */
export async function listar(c: PoolClient, f: Filtros) {
    const patron = `%${f.q.replace(/[\\%_]/g, '\\$&')}%`;
    return (await c.query<{ archivos: Archivo[]; total: number }>(`WITH visibles AS (
 SELECT ${columnas} ${relaciones}
 WHERE concat_ws(' ',a.nombre,a.responsabilidad) ILIKE $1 ESCAPE E'\\\\'
 AND ($2::bigint IS NULL OR a.oficina_id=$2) AND ($3::bigint IS NULL OR s.responsable_id=$3))
 SELECT (SELECT count(*)::int FROM visibles) total,coalesce((SELECT jsonb_agg(to_jsonb(p))
 FROM (SELECT * FROM visibles ORDER BY nombre,id::bigint LIMIT $4 OFFSET $5) p),'[]'::jsonb) archivos`,
    [patron, f.oficina_id ?? null, f.responsable_id ?? null, f.limite, (f.pagina - 1) * f.limite])).rows[0]!;
}

/** Proyección explícita de archivo y responsable vigente; no consulta inventarios. */
export async function obtener(c: PoolClient, id: string) {
    return (await c.query<Archivo>(`SELECT ${columnas} ${relaciones} WHERE a.id=$1`, [id])).rows[0];
}

/** Bloquea solo la identidad administrativa antes de corregir metadatos. */
export async function bloquear(c: PoolClient, id: string) {
    return (await c.query('SELECT id FROM archivos_institucionales WHERE id=$1 FOR UPDATE', [id])).rowCount === 1;
}

/** Referencias bloqueadas bajo el mismo advisory lock de administración. */
export async function referencias(c: PoolClient, oficinaId: string, responsableId: string) {
    const oficina = (await c.query<{ id: string; nombre: string }>('SELECT id::text,nombre FROM oficinas WHERE id=$1 FOR SHARE', [oficinaId])).rows[0];
    const responsable = (await c.query<{ activo: boolean; oficina_id: string | null; rol: string }>(
        `SELECT u.activo,u.oficina_id::text,r.nombre rol FROM usuarios u JOIN roles r ON r.id=u.rol_id
         WHERE u.id=$1 FOR SHARE OF u,r`, [responsableId])).rows[0];
    return { oficina, responsable };
}

/** Inserta las dos mitades; el trigger diferible comprueba el resultado al COMMIT. */
export async function crear(c: PoolClient, actor: string, datos: Crear) {
    const archivo = (await c.query<{ id: string }>(
        `INSERT INTO archivos_institucionales(oficina_id,nombre,responsabilidad,creado_por_id,fecha_creacion,motivo)
         VALUES($1,$2,$3,$4,clock_timestamp(),$5) RETURNING id::text`,
        [datos.oficina_id, datos.nombre, datos.responsabilidad, actor, datos.motivo])).rows[0]!;
    await c.query(`INSERT INTO archivos_asignaciones(archivo_id,responsable_id,fecha_inicio,formalizado_por_id,motivo)
        SELECT id,$2,fecha_creacion,$3,$4 FROM archivos_institucionales WHERE id=$1`,
        [archivo.id, datos.responsable_id, actor, datos.motivo]);
    return archivo.id;
}

/** Lista cerrada de campos editables: oficina y asignaciones nunca se actualizan aquí. */
export async function corregir(c: PoolClient, id: string, datos: Metadatos) {
    await c.query('UPDATE archivos_institucionales SET nombre=$2,responsabilidad=$3,motivo=$4 WHERE id=$1',
        [id, datos.nombre, datos.responsabilidad, datos.motivo]);
}

/** Historial de períodos paginado, sin autorización de escritura histórica. */
export async function asignaciones(c: PoolClient, id: string, f: Paginacion) {
    return (await c.query<{ asignaciones: Asignacion[]; total: number }>(`WITH periodos AS (
 SELECT s.id::text,s.responsable_id::text,concat_ws(' ',u.nombre,u.apellido) responsable,
 to_jsonb(s.fecha_inicio)#>>'{}' fecha_inicio,to_jsonb(s.fecha_fin)#>>'{}' fecha_fin,
 s.formalizado_por_id::text,concat_ws(' ',f.nombre,f.apellido) formalizador,s.motivo,
 s.finalizado_por_id::text,CASE WHEN fin.id IS NULL THEN NULL ELSE concat_ws(' ',fin.nombre,fin.apellido) END finalizador,s.motivo_fin
 FROM archivos_asignaciones s JOIN usuarios u ON u.id=s.responsable_id
 JOIN usuarios f ON f.id=s.formalizado_por_id LEFT JOIN usuarios fin ON fin.id=s.finalizado_por_id WHERE s.archivo_id=$1)
 SELECT (SELECT count(*)::int FROM periodos) total,coalesce((SELECT jsonb_agg(to_jsonb(p))
 FROM (SELECT * FROM periodos ORDER BY fecha_inicio DESC,id::bigint DESC LIMIT $2 OFFSET $3) p),'[]'::jsonb) asignaciones`,
    [id, f.limite, (f.pagina - 1) * f.limite])).rows[0]!;
}
