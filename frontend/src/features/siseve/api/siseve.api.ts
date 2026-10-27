import type { Solicitud } from '../schemas/siseve.schema';
import { z } from 'zod';
import { apiRequest } from '../../../api/client';
import { administracionSchema } from '../schemas/siseve.schema';
import { detalleDocumentoSchema, listaDocumentosSchema, historialSchema, opcionesSchema } from '../../documentos/schemas/documentos.schema';
import { movimientoSchema, listaMovimientosSchema } from '../../movimientos/schemas/movimientos.schema';
export { acceso } from './acceso.api';
/**
 * Consulta metadatos administrativos restringidos mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param token - JWT de la sesión vigente; no se envía en la URL.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const administracion = (token: string) => apiRequest('/api/siseve/administracion', administracionSchema, {}, token);
/**
 * Registra la autorización mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param token - JWT de la sesión vigente; no se envía en la URL.
 * @param activo - Condición de actividad solicitada.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const autorizar = (token: string, usuario_id: string, activo: boolean) => apiRequest('/api/siseve/autorizaciones', administracionSchema, { method: 'PUT', body: JSON.stringify({ usuario_id, activo }) }, token);
/**
 * Sustituye la clave adicional mediante Fetch autenticado y valida el contrato de respuesta con Zod; propaga ApiError si falla la solicitud o el formato recibido.
 * @param token - JWT de la sesión vigente; no se envía en la URL.
 * @param contrasena - Contraseña literal; no debe registrarse ni normalizarse.
 * @throws ApiError si el transporte, el estado HTTP o el contrato de respuesta no son válidos.
 */
export const cambiarClave = (token: string, contrasena: string) => apiRequest('/api/siseve/clave', administracionSchema, { method: 'PUT', body: JSON.stringify({ contrasena }) }, token);
export const resultadoSchema = z.union([detalleDocumentoSchema, z.object({ movimiento: movimientoSchema }), listaDocumentosSchema, listaMovimientosSchema, z.object({ historial: z.array(historialSchema) }), opcionesSchema]);
export type Resultado = z.infer<typeof resultadoSchema>;
/** Una llamada es una verificacion completa; nunca guarda clave ni genera credenciales de desbloqueo. */
export async function operar(token: string, clave: string, operacion: string, datos: unknown, id?: string) {
    return (await apiRequest('/api/siseve/operaciones', z.object({ resultado: resultadoSchema }), { method: 'POST', body: JSON.stringify({ clave, operacion, datos, ...(id ? { id } : {}) }) }, token)).resultado;
}
/** Adapta campos visuales al contrato estricto existente sin permitir campos generados o privilegios. */
export function ejecutarSolicitud(token: string, d: Solicitud, tipoId: string, destinoAutorizado: string | null, versionDocumental?: string) {
    const contenido = { asunto: d.asunto, remitente: d.remitente || null, observaciones: d.observaciones || null };
    let datos: unknown = {};
    switch (d.operacion) {
        case 'listar':
            datos = { q: d.q, pagina: Number(d.pagina) || 1, ...(d.estado ? { estado: d.estado } : {}) };
            break;
        case 'movimientos':
            datos = { ...(d.id ? { documento_id: d.id } : {}), pagina: Number(d.pagina) || 1, ...(d.estado ? { estado: d.estado } : {}) };
            break;
        case 'registrar':
            datos = { ...contenido, tipo_documental_id: tipoId, archivador_id: d.archivador_id || null };
            break;
        case 'corregir':
            datos = { ...contenido, motivo: d.motivo, ...(versionDocumental?{version_documental:versionDocumental}:{}) };
            break;
        case 'autorizar':
            datos = { usuario_destino_id: d.usuario_destino_id, motivo: d.motivo };
            break;
        case 'salir':
            datos = { documento_id: d.id, usuario_destino_id: destinoAutorizado ?? d.usuario_destino_id, motivo: d.motivo };
            break;
        case 'recibir':
            datos = { archivador_id: d.archivador_id || null };
            break;
        case 'recuperar':
        case 'cancelar':
            datos = { archivador_id: d.archivador_id || null, motivo: d.motivo, confirmar_recuperacion: d.confirmado };
            break;
        case 'rechazar':
        case 'anular':
        case 'solicitar-decision':
        case 'retirar-autorizacion':
            datos = { motivo: d.motivo };
            break;
    }
    return operar(token, d.clave, d.operacion, datos, d.id || undefined);
}
