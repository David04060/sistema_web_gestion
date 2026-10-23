import { escrituraAdministrativa } from '../../shared/admin/admin.repository.js';
import { nombreCanonico } from '../../shared/admin/admin.schema.js';
import { HttpError } from '../../shared/http/HttpError.js';
import type { DatosTipo } from './tipos-documentales.schema.js';
import * as repository from './tipos-documentales.repository.js';
/** Denominaciones y prefijos institucionales confirmados; nunca se asignan automáticamente. */
const institucionales = new Map([['informe', 'INF'], ['oficio', 'OFI'], ['memorando', 'MEM'], ['acta', 'ACT'], ['comunicado', 'COM'], ['fut', 'FUT']]);
export const listar = repository.listar;
/**
 * Devuelve el tipo documental existente o genera un 404 público; sus reservas se conservan para la edición posterior.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 */
export async function detalle(id: string) {
    const tipo = await repository.obtener(id);
    if (!tipo)
        throw new HttpError(404, 'Tipo documental inexistente');
    return tipo;
}
/** Preserva reservas e historia bajo bloqueo de fila y auditoría del actor administrativo. */
export async function guardar(actor: string, datos: DatosTipo, id: string | null = null) {
    return escrituraAdministrativa(actor, /** Bloquea el tipo y preserva reservas institucionales y prefijos históricos antes de comprobar duplicados y guardar. */ async (cliente) => {
        if (id)
            await repository.bloquear(id, cliente);
        const anterior = id ? await repository.obtener(id, cliente) : undefined;
        if (id && !anterior)
            throw new HttpError(404, 'Tipo documental inexistente');
        const nombre = nombreCanonico(datos.nombre);
        if (anterior && (nombreCanonico(anterior.nombre) === 'síseve' || anterior.requiere_clave)) {
            if (datos.nombre !== anterior.nombre || datos.prefijo_codigo !== anterior.prefijo_codigo)
                throw new HttpError(409, 'El tipo restringido está reservado');
        }
        if (nombre === 'síseve' && (!anterior || nombreCanonico(anterior.nombre) !== 'síseve'))
            throw new HttpError(409, 'SíseVe es una categoría reservada');
        if (anterior && institucionales.has(nombreCanonico(anterior.nombre)) &&
            (datos.nombre !== anterior.nombre || datos.prefijo_codigo !== anterior.prefijo_codigo))
            throw new HttpError(409, 'La denominación y el prefijo institucional están protegidos');
        if (institucionales.has(nombre) && institucionales.get(nombre) !== datos.prefijo_codigo)
            throw new HttpError(409, 'El prefijo no corresponde al tipo institucional');
        if (anterior?.prefijo_protegido && anterior.prefijo_codigo !== datos.prefijo_codigo)
            throw new HttpError(409, 'El prefijo está protegido por códigos documentales generados');
        if (await repository.duplicado(datos, id, cliente))
            throw new HttpError(409, 'El nombre o prefijo ya está registrado');
        return (await repository.obtener(await repository.guardar(datos, id, cliente), cliente))!;
    });
}
