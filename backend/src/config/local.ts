import type { ClientBase } from 'pg';

/** Destino de desarrollo autorizado: no depende de manifiestos ni identificadores de copias. */
export function validarUrlLocal(valor: string) {
    const url = new URL(valor);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
        || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        || url.pathname !== '/sistema_web_final') {
        throw new Error('Desarrollo requiere DATABASE_URL hacia sistema_web_final en localhost.');
    }
    return url;
}

/** Lecturas previas a prestar una conexión de desarrollo; nunca migra ni escribe. */
export async function verificarConexionLocal(cliente: Pick<ClientBase, 'query'>, conexion: string, comprobarEsquema = true) {
    const url = validarUrlLocal(conexion);
    const identidad = (await cliente.query(`SELECT current_database() base,inet_server_addr()::text host,
        inet_server_port() puerto,current_schema() esquema,current_user rol,
        current_setting('neon.branch_id',true) rama`)).rows[0];
    if (identidad?.base !== 'sistema_web_final' || !['127.0.0.1/32', '::1/128'].includes(identidad.host)
        || identidad.puerto !== Number(url.port || 5432) || identidad.esquema !== 'public' || identidad.rama) {
        throw new Error('La conexión no corresponde a sistema_web_final local, puerto configurado y esquema public.');
    }
    if (comprobarEsquema) {
        try {
            await cliente.query(`SELECT d.clasificacion_registro,f.documento_id,f.situacion,f.tipo,f.oficina_id,f.usuario_id,
                f.destinatario,f.asignado_por_id,f.asignado_por_nombre,f.asignado_en,
                f.confirmado_por_id,f.confirmado_por_nombre,f.confirmado_en,f.revision,
                f.observaciones_direccion,f.estante_direccion_id,f.archivador_direccion_id,f.ubicacion_direccion,
                h.id,h.documento_id,h.evento,h.actor,h.destinatario,h.fecha,h.observaciones,h.ubicacion
                FROM public.documentos d LEFT JOIN public.entregas_secretaria f ON f.documento_id=d.id
                LEFT JOIN public.entregas_secretaria_historial h ON h.documento_id=d.id LIMIT 0`);
            await cliente.query('SELECT documento_id,documento_origen_id,creado_por_id,creado_por_nombre,creado_en FROM public.documentos_relaciones LIMIT 0');
            await cliente.query('SELECT documento_id,oficina_id,usuario_id,oficina_nombre,persona_nombre,destinatario,actor_id,actor_nombre,registrada_en FROM public.delegaciones_personales LIMIT 0');
        } catch {
            throw new Error('Faltan las migraciones locales de documentos. Ejecute npm run migrate:local en backend; el arranque no migra automáticamente.');
        }
    }
    return identidad;
}
