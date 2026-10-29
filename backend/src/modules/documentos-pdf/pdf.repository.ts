import type { PoolClient } from 'pg';
import { conexionDocumental } from '../../shared/documental/contexto.js';
export interface PdfVigente { revision: string; clave: string; nombre: string; tamano: number; cargado_en: string }
export interface Carga { id: string; documento_id: string; actor_id: string; temporal: string; definitiva: string; nombre: string; tamano: number; revision: string | null; vence: Date; confirmado: boolean }
/** La autorización del documento siempre precede a estas consultas privadas. */
export async function vigente(id: string, c = conexionDocumental()) {
    return (await c.query<PdfVigente>('SELECT revision,clave,nombre,tamano,cargado_en::text FROM documentos_pdf WHERE documento_id=$1', [id])).rows[0];
}
export async function pendientes(id: string, c = conexionDocumental()) {
    return Number((await c.query("SELECT count(*) n FROM pdf_objetos o WHERE documento_id=$1 AND eliminado_en IS NULL AND EXISTS(SELECT 1 FROM pdf_cargas c WHERE c.definitiva=o.clave AND (c.confirmado OR o.limpiar_desde<=clock_timestamp())) AND NOT EXISTS(SELECT 1 FROM documentos_pdf p WHERE p.clave=o.clave)", [id])).rows[0].n);
}
export async function evento(c: PoolClient, id: string, actor: string | null, accion: string, revision: string | null = null) {
    await c.query('INSERT INTO pdf_eventos(documento_id,actor_id,accion,revision) VALUES($1,$2,$3,$4)', [id, actor, accion, revision]);
}
export async function crear(c: PoolClient, carga: Carga) {
    await c.query('INSERT INTO pdf_cargas(id,documento_id,actor_id,temporal,definitiva,nombre,tamano,revision,vence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [carga.id,carga.documento_id,carga.actor_id,carga.temporal,carga.definitiva,carga.nombre,carga.tamano,carga.revision,carga.vence]);
    // Intención durable ANTES de firmar o copiar. También cubre caída del proceso o rollback posterior.
    await c.query('INSERT INTO pdf_objetos(clave,documento_id,limpiar_desde) VALUES($1,$3,$4),($2,$3,$4)', [carga.temporal,carga.definitiva,carga.documento_id,new Date(carga.vence.getTime()+60_000)]);
}
export async function carga(c: PoolClient, id: string, documento: string, actor: string) {
    return (await c.query<Carga>('SELECT *,documento_id::text,actor_id::text FROM pdf_cargas WHERE id=$1 AND documento_id=$2 AND actor_id=$3 FOR UPDATE', [id,documento,actor])).rows[0];
}
export async function vincular(c: PoolClient, d: Carga) {
    await c.query('INSERT INTO documentos_pdf(documento_id,revision,clave,nombre,tamano,cargado_por) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(documento_id) DO UPDATE SET revision=EXCLUDED.revision,clave=EXCLUDED.clave,nombre=EXCLUDED.nombre,tamano=EXCLUDED.tamano,cargado_por=EXCLUDED.cargado_por,cargado_en=clock_timestamp()', [d.documento_id,d.id,d.definitiva,d.nombre,d.tamano,d.actor_id]);
    await c.query('UPDATE pdf_cargas SET confirmado=true WHERE id=$1', [d.id]);
}
export async function retirar(c: PoolClient, id: string) { await c.query('DELETE FROM documentos_pdf WHERE documento_id=$1', [id]); }
export async function programar(c: PoolClient, clave: string) { await c.query('UPDATE pdf_objetos SET limpiar_desde=clock_timestamp() WHERE clave=$1', [clave]); }
