import { pool } from '../../config/database.js';
import { obtenerActor } from '../../shared/documental/transaccion.js';
import * as repository from './dashboard.repository.js';
import type { Dashboard } from './dashboard.types.js';
/** Revalida permisos en la misma instantánea de solo lectura que los indicadores. */
export async function obtener(actorId: string): Promise<Dashboard> {
    const c = await pool.connect();
    try {
        await c.query('BEGIN');
        await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const actor = await obtenerActor(actorId, c);
        const admin = actor.rol === 'Administrador';
        const contexto = await repository.contexto(c, actor.oficina_id);
        const resultado: Dashboard = {
            alcance: admin ? 'administrativo' : ['Director(a)','Secretaria de Dirección'].includes(actor.rol) ? 'institucional' : 'personal',
            actualizado: contexto.fecha,
            atencion: await repository.atencion(c,actor),
            ...(admin ? { indicadores: await repository.administracion(c), estados: [], operaciones: [], recientes: [], pendientes: [] } : await repository.documental(c, actor)),
            accesos: admin ? [{ etiqueta: 'Usuarios', ruta: '/usuarios' }, { etiqueta: 'Oficinas', ruta: '/oficinas' }, { etiqueta: 'Roles', ruta: '/roles' }, { etiqueta: 'Tipos documentales', ruta: '/tipos-documentales' }] : [
                { etiqueta: 'Consultar documentos', ruta: '/documentos' }, { etiqueta: 'Movimientos', ruta: '/movimientos' },
                ...(actor.oficina_id ? [{ etiqueta: 'Registrar documento recibido', ruta: '/documentos/nuevo?clasificacion=RECIBIDO' }, { etiqueta: 'Registrar documento emitido', ruta: '/documentos/nuevo?clasificacion=EMITIDO' }] : []), { etiqueta: 'Mis ubicaciones', ruta: '/ubicaciones' }
            ],
        };
        await c.query('COMMIT');
        return resultado;
    }
    catch (error) {
        await c.query('ROLLBACK');
        throw error;
    }
    finally {
        c.release();
    }
}
