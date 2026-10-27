import type { PoolClient } from 'pg';
import { pool } from '../../config/database.js';
import { escrituraAdministrativa } from '../../shared/admin/admin.repository.js';
import { obtenerActor } from '../../shared/documental/transaccion.js';
import { HttpError } from '../../shared/http/HttpError.js';
import * as repository from './archivos.repository.js';
import type { Crear, Filtros, Metadatos, Paginacion } from './archivos.schema.js';

/** Revalida el perfil en una instantánea de lectura y establece contexto local para RLS. */
async function leer<T>(actorId: string, operacion: (c: PoolClient) => Promise<T>) {
    const c = await pool.connect();
    try {
        await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const actor = await obtenerActor(actorId, c);
        if (actor.rol !== 'Administrador') throw new HttpError(403, 'Solo el Administrador administra archivos');
        await c.query("SELECT set_config('app.usuario_actor_id',$1,true)", [actorId]);
        const resultado = await operacion(c);
        await c.query('COMMIT');
        return resultado;
    } catch (error) {
        await c.query('ROLLBACK');
        throw error;
    } finally { c.release(); }
}

/** Traduce conflictos propios del módulo sin publicar SQL o detalles privados. */
async function escribir<T>(actorId: string, motivo: string, accion: 'CREAR' | 'CORREGIR', operacion: (c: PoolClient) => Promise<T>) {
    try {
        return await escrituraAdministrativa(actorId, async c => {
            await c.query("SELECT set_config('app.motivo_documental',$1,true),set_config('app.archivo_operacion',$2,true)", [motivo, accion]);
            return operacion(c);
        });
    } catch (error) {
        const codigo = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
        if (codigo === '23505') throw new HttpError(409, 'Ya existe un archivo con esa denominación en la oficina');
        if (codigo === '23503') throw new HttpError(400, 'La oficina o el responsable seleccionado ya no existe');
        if (codigo === '40001' || codigo === '40P01' || codigo === '55P03')
            throw new HttpError(409, 'Otra operación modificó las referencias; actualiza la consulta e inténtalo de nuevo');
        throw error;
    }
}

/** Obtiene la proyección administrativa o un 404 sin consultar documentos. */
async function exigirArchivo(c: PoolClient, id: string) {
    const archivo = await repository.obtener(c, id);
    if (!archivo) throw new HttpError(404, 'Archivo institucional no encontrado');
    return archivo;
}

export const listar = (actor: string, filtros: Filtros) => leer(actor, async c => ({
    ...await repository.listar(c, filtros), pagina: filtros.pagina, limite: filtros.limite,
}));
export const detalle = (actor: string, id: string) => leer(actor, c => exigirArchivo(c, id));
export const asignaciones = (actor: string, id: string, filtros: Paginacion) => leer(actor, async c => {
    await exigirArchivo(c, id);
    return { ...await repository.asignaciones(c, id, filtros), pagina: filtros.pagina, limite: filtros.limite };
});

/** La cuenta debe estar activa, tener la misma oficina y cumplir su correspondencia institucional. */
export async function crear(actor: string, datos: Crear) {
    return escribir(actor, datos.motivo, 'CREAR', async c => {
        const { oficina, responsable } = await repository.referencias(c, datos.oficina_id, datos.responsable_id);
        if (!oficina) throw new HttpError(400, 'La oficina seleccionada no existe');
        if (!responsable) throw new HttpError(400, 'El responsable seleccionado no existe');
        if (!responsable.activo) throw new HttpError(400, 'El responsable debe tener una cuenta activa');
        if (responsable.oficina_id !== oficina.id) throw new HttpError(400, 'El responsable debe pertenecer a la oficina del archivo');
        if ((responsable.rol === 'Director(a)' && oficina.nombre !== 'Dirección') ||
            (responsable.rol === 'Secretaria de Dirección' && oficina.nombre !== 'Mesa de Partes'))
            throw new HttpError(400, 'El rol del responsable no es compatible con la oficina institucional');
        const id = await repository.crear(c, actor, datos);
        return exigirArchivo(c, id);
    });
}

/** Corrige metadatos con motivo; conserva oficina, autoría y período inicial. */
export async function corregir(actor: string, id: string, datos: Metadatos) {
    return escribir(actor, datos.motivo, 'CORREGIR', async c => {
        if (!await repository.bloquear(c, id)) throw new HttpError(404, 'Archivo institucional no encontrado');
        await repository.corregir(c, id, datos);
        return exigirArchivo(c, id);
    });
}
