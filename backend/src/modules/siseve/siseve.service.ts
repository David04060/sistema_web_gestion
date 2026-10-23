import { sinDatosSchema } from './siseve.schema.js';
import { obtenerActor } from '../../shared/documental/transaccion.js';
import { escrituraAdministrativa } from '../../shared/admin/admin.repository.js';
import { transaccionDocumental } from '../../shared/documental/transaccion.js';
import { ejecutarRestringido } from '../../shared/documental/contexto.js';
import { generarHash, verificarContrasena } from '../../shared/security/password.js';
import { HttpError } from '../../shared/http/HttpError.js';
import { validar } from '../../shared/http/validar.js';
import { idSchema } from '../../shared/admin/admin.schema.js';
import * as documentos from '../documentos/documentos.service.js';
import * as ds from '../documentos/documentos.schema.js';
import * as movimientos from '../movimientos/movimientos.service.js';
import * as ms from '../movimientos/movimientos.schema.js';
import * as repository from './siseve.repository.js';
import type { Operacion } from './siseve.schema.js';
// Formato ficticio válido: mantiene el coste scrypt de cada rechazo sin I/O al importar.
// No concede acceso: operar exige además un hash real y autorización individual.
const hashFalso = 'scrypt$16384$8$1$' + '0'.repeat(32) + '$' + '0'.repeat(128);
/** Proyeccion administrativa: estado de configuracion y permisos, sin contenido ni hash. */
export async function administracion() {
    return {
        configuracion: await repository.configuracion(),
        usuarios: await repository.autorizaciones(),
    };
}
/** Conserva la fila historica; actor y fechas provienen de la transaccion y sus triggers. */
export async function autorizar(actorId: string, usuarioId: string, activo: boolean) {
    await escrituraAdministrativa(actorId, /** Comprueba la configuración y conserva el permiso individual dentro de la escritura administrativa. */ async (cliente) => {
        const tipo = await repository.tipo(cliente);
        if (!tipo) {
            throw new HttpError(409, 'Configuracion institucional no disponible');
        }
        if (!await repository.autorizar(cliente, tipo.id, actorId, usuarioId, activo)) {
            throw new HttpError(400, 'La cuenta debe estar activa');
        }
    });
    return administracion();
}
/**
 * Sustituye el hash bajo bloqueo, sin devolver ni registrar el secreto.
 * @param contrasena Clave literal nueva; no se recorta ni se normaliza.
 * @returns Proyeccion administrativa sin hash, una vez confirmado el cambio.
 */
export async function cambiarClave(actorId: string, contrasena: string) {
    const hash = await generarHash(contrasena);
    await escrituraAdministrativa(actorId, /** Bloquea la clave anterior, impide reutilizarla y sustituye su hash en la misma transacción. */ async (cliente) => {
        const tipo = await repository.tipo(cliente);
        if (!tipo) {
            throw new HttpError(409, 'Configuracion institucional no disponible');
        }
        const anterior = await repository.claveActual(cliente, tipo.id);
        if (anterior && await verificarContrasena(contrasena, anterior)) {
            throw new HttpError(409, 'La nueva contraseña debe ser distinta de la actual');
        }
        await repository.guardarClave(cliente, tipo.id, hash);
    });
    return administracion();
}
/**
 * Puerta unica por operacion: JWT vigente, autorizacion individual y scrypt.
 * El contexto y su conexion existen solo durante esta llamada. La revocacion/rotacion
 * serializan con la transaccion; ninguna solicitud posterior reutiliza una validacion.
 * @param actorId - Cuenta autenticada cuya actividad revalida la unidad documental.
 * @param solicitud - Operación validada y clave literal para esta petición; el secreto no se persiste.
 * @returns Resultado del servicio documental o de movimientos, bajo el mismo contexto transaccional restringido.
 * @throws HttpError 403 con mensaje uniforme si falta configuración, permiso o clave válida; propaga las restricciones de la operación solicitada.
 */
export async function operar(actorId: string, solicitud: Operacion) {
    return transaccionDocumental(actorId, 'Operacion documental restringida', /** Verifica permiso individual y clave en esta petición antes de habilitar el contexto restringido temporal. */ async (cliente) => {
        const tipo = await repository.tipo(cliente);
        const acceso = tipo ? await repository.acceso(cliente, tipo.id, actorId) : { autorizado: false, hash: undefined };
        const coincide = await verificarContrasena(solicitud.clave, acceso.hash ?? hashFalso);
        if (!tipo || !acceso.autorizado || !acceso.hash || !coincide)
            throw new HttpError(403, 'No se pudo autorizar la operacion restringida');
        return ejecutarRestringido(cliente, tipo.id, /** Reutiliza los servicios documentales ordinarios únicamente dentro del contexto restringido de esta operación. */ () => ejecutar(actorId, solicitud));
    });
}
/** Reutiliza los mismos servicios y contratos: la clave adicional no altera custodia ni transiciones. */
async function ejecutar(actorId: string, s: Operacion): Promise<unknown> {
    const datos = s.datos ?? {};
    if (['detalle', 'historial', 'opciones', 'movimiento'].includes(s.operacion))
        validar(sinDatosSchema, datos);
    /**
     * Valida el identificador de la operación únicamente cuando la rama seleccionada necesita un registro concreto.
     */
    const id = () => validar(idSchema, s.id);
    switch (s.operacion) {
        case 'listar': return documentos.listar(actorId, validar(ds.filtrosSchema, datos));
        case 'detalle': return { documento: await documentos.detalle(actorId, id()) };
        case 'historial': return { historial: await documentos.historial(actorId, id()) };
        case 'opciones': return documentos.opciones(actorId);
        case 'registrar': return { documento: await documentos.registrar(actorId, validar(ds.registrarSchema, datos)) };
        case 'corregir': return { documento: await documentos.corregir(actorId, id(), validar(ds.corregirSchema, datos)) };
        case 'anular': return { documento: await documentos.anular(actorId, id(), validar(ds.anularSchema, datos).motivo) };
        case 'autorizar': {
            const d = validar(ds.autorizarSchema, datos);
            return { documento: await documentos.autorizar(actorId, id(), d.usuario_destino_id, d.motivo) };
        }
        case 'retirar-autorizacion': return { documento: await documentos.autorizar(actorId, id(), null, validar(ds.anularSchema, datos).motivo) };
        case 'solicitar-decision': return { documento: await documentos.solicitarDecision(actorId, id(), validar(ds.anularSchema, datos).motivo) };
        case 'movimientos': return movimientos.listar(actorId, validar(ms.filtrosSchema, datos));
        case 'movimiento': return { movimiento: await movimientos.detalle(actorId, id()) };
        case 'salir': return { movimiento: await movimientos.derivar(actorId, validar(ms.derivarSchema, datos)) };
        case 'recibir': return { movimiento: await movimientos.resolver(actorId, id(), 'recibir', validar(ms.recepcionSchema, datos)) };
        case 'rechazar': return { movimiento: await movimientos.resolver(actorId, id(), 'rechazar', validar(ms.motivoMovimientoSchema, datos)) };
        case 'recuperar':
        case 'cancelar': return { movimiento: await movimientos.resolver(actorId, id(), s.operacion, validar(ms.recuperacionSchema, datos)) };
    }
}
/**
 * Revalida la cuenta y devuelve sus metadatos de acceso y registro; el indicador de administrador no concede autorización documental.
 * @param usuarioId - ID de la cuenta sobre la que se consulta o administra el permiso.
 */
export async function accesoPropio(usuarioId: string) {
    const actor = await obtenerActor(usuarioId);
    return { ...await repository.accesoPropio(usuarioId), administrador: actor.rol === 'Administrador', puede_registrar: actor.oficina_id !== null };
}
