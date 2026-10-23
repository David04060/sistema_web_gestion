import { AsyncLocalStorage } from 'node:async_hooks';
import type { PoolClient } from 'pg';
import { pool } from '../../config/database.js';
interface Contexto {
    cliente: PoolClient;
    tipoRestringido: string;
}
const contexto = new AsyncLocalStorage<Contexto>();
/** Alcance exclusivo de UNA operacion ya verificada; no persiste entre solicitudes. */
export async function ejecutarRestringido<T>(cliente: PoolClient, tipoRestringido: string, operacion: () => Promise<T>) {
    if (!/^[1-9][0-9]*$/.test(tipoRestringido))
        throw new Error('Contexto documental invalido');
    await cliente.query("SELECT set_config('app.tipo_restringido_id',$1,true)", [tipoRestringido]);
    return contexto.run({ cliente, tipoRestringido }, operacion);
}
/**
 * Devuelve la conexión restringida de esta operación asíncrona, si existe; nunca reutiliza la de otra solicitud.
 */
export function clienteDocumental() {
    return contexto.getStore()?.cliente;
}
/**
 * Selecciona la conexión restringida de la operación o el pool ordinario, manteniendo el contexto de autorización vigente.
 */
export function conexionDocumental() {
    return clienteDocumental() ?? pool;
}
/** El ID procede del catalogo bloqueado, nunca del body; se vincula como parametro mediante set_config local; no se interpola en SQL. */
export function tipoVisibleSQL() {
    const id = contexto.getStore()?.tipoRestringido;
    if (!id)
        return "NOT td.requiere_clave AND lower(btrim(td.nombre))<>'síseve'";
    if (!/^[1-9][0-9]*$/.test(id))
        throw new Error('Contexto documental invalido');
    return "td.requiere_clave AND td.id=nullif(current_setting('app.tipo_restringido_id',true),'')::bigint";
}
