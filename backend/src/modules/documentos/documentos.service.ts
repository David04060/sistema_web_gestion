import {registrarDelegacionPersonal,delegacionPersonalSchema} from './delegacion-personal.js';
import type {z} from 'zod';
import type { PoolClient } from 'pg';
import { clienteDocumental } from '../../shared/documental/contexto.js';
import type { ActorDocumental } from '../../shared/documental/transaccion.js';
import { transaccionDocumental, obtenerActor } from '../../shared/documental/transaccion.js';
import { HttpError } from '../../shared/http/HttpError.js';
import * as repository from './documentos.repository.js';
import type { Contenido, Registrar, Filtros } from './documentos.schema.js';
/**
 * Revalida al actor y obtiene página y total autorizados; conserva los filtros de paginación en la respuesta.
 * @param actorId - ID de la cuenta autenticada que debe revalidarse antes de operar.
 * @param filtros - Filtros validados de búsqueda y paginación.
 */
export async function listar(actorId: string, filtros: Filtros) {
    const actor = await obtenerActor(actorId);
    return { ...await repository.listar(actor, filtros), pagina: filtros.pagina, limite: filtros.limite };
}
/**
 * Obtiene el contenido consultable y calcula permisos de presentación con custodia y estado vigentes.
 * La autorización de contenido precede a consultar ubicación anterior o auditoría.
 * @param actorId - Cuenta autenticada; se consulta su actividad y rol en PostgreSQL.
 * @param id - Documento cuyo contenido se solicita.
 * @returns Documento, antecedente de ubicación y operaciones potencialmente disponibles.
 * @throws HttpError 401 si la cuenta está inactiva o 404 si el documento no existe o no es consultable.
 * Las escrituras vuelven a validar las reglas dentro de su transacción; estos indicadores no autorizan por sí mismos.
 */
export async function detalle(actorId: string, id: string) {
    const actor = await obtenerActor(actorId);
    const documento = await repository.obtener(actor, id);
    if (!documento)
        throw new HttpError(404, 'Documento inexistente o no autorizado');
    const libre = documento.activo && ['RECIBIDO', 'PENDIENTE_DECISION'].includes(documento.estado_tramite);
    const custodio = libre && documento.responsable_actual_id === actor.id
        && (!!clienteDocumental() || documento.registrado_por_id === actor.id);
    const mesa = actor.rol === 'Secretaria de Dirección' || documento.oficina === 'Mesa de Partes';
    const contenido = clienteDocumental()?{editar:custodio,anular:custodio}:await repository.permisosContenido(actor,id);
    return { ...documento, ...await repository.relacionesDocumento(actor,id), ultima_ubicacion: await repository.ultimaUbicacion(id), permisos: { delegar_personal: !clienteDocumental() && actor.rol==='Usuario' && documento.registrado_por_id===actor.id && documento.activo && !documento.entrega, registrar_relacionado: !clienteDocumental() && actor.rol === 'Secretaria de Dirección' && (await repository.rolRegistrador(id)) === 'Secretaria de Dirección', editar: contenido.editar, anular: contenido.anular, asignar_destinatario: !!documento.entrega && documento.activo && documento.entrega.situacion === 'PENDIENTE_DECISION' && (['Director(a)','Secretaria de Dirección'].includes(actor.rol) && (actor.rol==='Director(a)' || documento.registrado_por_id===actor.id || await repository.rolRegistrador(id)==='Director(a)')), confirmar_entrega: !!documento.entrega && documento.activo && documento.entrega.situacion === 'DELEGADO' && actor.rol === 'Secretaria de Dirección' && (documento.registrado_por_id === actor.id || await repository.rolRegistrador(id) === 'Director(a)'), autorizar: !documento.entrega && libre && documento.estado_tramite === 'PENDIENTE_DECISION' && actor.rol === 'Director(a)', salir: (!documento.registro_personal || !!clienteDocumental()) && !documento.entrega && custodio && (documento.estado_tramite === 'PENDIENTE_DECISION' ? documento.destinatario_autorizado_id !== null : !mesa), solicitar_decision: (!documento.registro_personal || !!clienteDocumental()) && !documento.entrega && custodio && mesa && documento.estado_tramite === 'RECIBIDO' } };
}
/**
 * Autoriza primero el contenido del documento y solo después solicita su auditoría completa.
 * @param actorId - ID de la cuenta autenticada que debe revalidarse antes de operar.
 * @param id - Identificador textual del registro al que se aplica esta operación.
 */
export async function historial(actorId: string, id: string) {
    await detalle(actorId, id);
    const anterior=await repository.historial(id);
    const {conexionDocumental}=await import('../../shared/documental/contexto.js');
    const nuevos=(await conexionDocumental().query("SELECT id::text,evento accion,NULL::text usuario_actor_id,actor,to_jsonb(fecha)#>>'{}' fecha,jsonb_strip_nulls(jsonb_build_object('Destinatario',destinatario,'Observaciones',observaciones,'Ubicación',ubicacion)) campos_modificados FROM entregas_secretaria_historial WHERE documento_id=$1 ORDER BY fecha,id",[id])).rows;
    const personales=clienteDocumental()?[]:(await conexionDocumental().query("SELECT documento_id::text id,'Delegación personal' accion,actor_id::text usuario_actor_id,actor_nombre actor,to_jsonb(registrada_en)#>>'{}' fecha,jsonb_build_object('Destinatario',destinatario) campos_modificados FROM delegaciones_personales WHERE documento_id=$1",[id])).rows;
    return [...anterior,...nuevos,...personales].sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)));
}
/** Bloquea antes de evaluar permisos, evitando decisiones basadas en una custodia antigua. */
export async function documentoBloqueado(actor: ActorDocumental, id: string, cliente: PoolClient) {
    await repository.bloquear(id, cliente);
    const documento = await repository.obtener(actor, id, cliente);
    if (!documento)
        throw new HttpError(404, 'Documento inexistente o no autorizado');
    if (!documento.activo)
        throw new HttpError(409, 'El documento esta anulado');
    return documento;
}
/**
 * Exige custodia actual y ausencia de traslado o recuperación abierta; rechaza con 403 o 409 antes de modificar el documento.
 * @param actor - Cuenta o ID autenticado utilizado para aplicar autorización y auditoría.
 * @param documento - Fila bloqueada y autorizada cuya custodia se comprueba.
 * @param cliente - Conexión PostgreSQL de la transacción actual.
 */
export async function exigirEditable(actor: ActorDocumental, documento: repository.Documento, cliente: PoolClient) {
    if (!clienteDocumental() && documento.registrado_por_id !== actor.id)
        throw new HttpError(403, 'La consulta por autoría no concede edición ni anulación de registros ajenos');
    if (documento.responsable_actual_id !== actor.id)
        throw new HttpError(403, 'Solo el custodio actual puede realizar esta operacion');
    if (await repository.movimientoAbierto(documento.id, cliente))
        throw new HttpError(409, 'Primero debe finalizar la circulacion o recuperacion fisica');
}
/**
 * Revalida al actor y obtiene catálogos y filtros documentales limitados por su acceso actual.
 * @param actorId - ID de la cuenta autenticada que debe revalidarse antes de operar.
 */
export async function opciones(actorId: string) {
    return repository.opciones(await obtenerActor(actorId));
}
/**
 * Registra el original bajo custodia del actor y su oficina vigente.
 * @param datos Contenido humano y referencias; el trigger genera codigo y fechas.
 * @returns Detalle autorizado despues de confirmar la transaccion.
 */
export async function registrar(actorId: string, datos: Registrar) {
    const id = await transaccionDocumental(actorId, 'Registro inicial del documento fisico', /** Verifica oficina y tipo registrable antes de insertar el original con estado inicial del circuito correspondiente. */ async (cliente, actor) => {
        if (!['Usuario', 'Secretaria de Dirección', 'Director(a)'].includes(actor.rol))
            throw new HttpError(403, 'El perfil administrativo no registra documentos');
        if (!actor.oficina_id)
            throw new HttpError(409, 'Debe tener una oficina asignada para registrar documentos');
        if (!await repository.tipoRegistrable(datos.tipo_documental_id, cliente))
            throw new HttpError(400, 'Tipo restringido o sin prefijo documental aprobado');
        if(datos.delegacion_personal && (clienteDocumental()||actor.rol!=='Usuario'))throw new HttpError(403,'Delegación personal no autorizada');
        if(datos.decision_inicial && (clienteDocumental()||!['Director(a)','Secretaria de Dirección'].includes(actor.rol)))throw new HttpError(403,'Solo Dirección o Secretaría puede indicar una decisión inicial ordinaria');
        if(!clienteDocumental()&&['Director(a)','Secretaria de Dirección'].includes(actor.rol)&&datos.archivador_id)throw new HttpError(400,'Use la opción de guardar para indicar la ubicación');
        if (datos.documento_origen_id) {
            if (clienteDocumental() || actor.rol !== 'Secretaria de Dirección') throw new HttpError(403,'Solo Secretaría registra documentos relacionados');
            await repository.bloquear(datos.documento_origen_id,cliente);
            const origen=await repository.obtener(actor,datos.documento_origen_id,cliente);
            if (!origen || await repository.rolRegistrador(origen.id,cliente) !== 'Secretaria de Dirección') throw new HttpError(404,'Documento de origen inexistente o no autorizado');
        }
        const mesa = actor.rol === 'Secretaria de Dirección' || await repository.oficinaNombre(actor.oficina_id, cliente) === 'Mesa de Partes';
        const id = await repository.registrar(actor, datos, mesa ? 'PENDIENTE_DECISION' : 'RECIBIDO', cliente);
        if (!clienteDocumental() && ['Secretaria de Dirección','Director(a)'].includes(actor.rol)) await cliente.query('INSERT INTO entregas_secretaria(documento_id) VALUES($1)',[id]);
        if(datos.decision_inicial){
            const documento=await documentoBloqueado(actor,id,cliente);
            if(datos.decision_inicial.accion==='DELEGAR')await aplicarDelegacion(cliente,actor,documento,{...datos.decision_inicial,revision:0});
            else await aplicarGuardado(cliente,actor,documento,{...datos.decision_inicial,revision:0});
        }
        if(datos.delegacion_personal)await registrarDelegacionPersonal(cliente,actor,id,datos.delegacion_personal);
        if (datos.documento_origen_id) await repository.relacionar(id,datos.documento_origen_id,cliente);
        return id;
    });
    return detalle(actorId, id);
}
/** Corrige exclusivamente contenido; motivo e identidad quedan en auditoria atomica. */
export async function corregir(actorId: string, id: string, datos: Contenido & {
    motivo: string;
}) {
    await transaccionDocumental(actorId, datos.motivo, /** Bloquea y comprueba custodia antes de corregir exclusivamente el contenido con auditoría atómica. */ async (cliente, actor) => {
        const documento = await documentoBloqueado(actor, id, cliente);
        if(clienteDocumental())await exigirEditable(actor,documento,cliente);
        else if(!(await repository.permisosContenido(actor,id,cliente)).editar)throw new HttpError(403,'No tiene permiso para corregir este documento');
        await repository.corregir(id, datos, cliente);
    });
    return detalle(actorId, id);
}
/** Anulacion logica irreversible desde la interfaz; conserva codigo, relaciones e historial. */
export async function anular(actorId: string, id: string, motivo: string) {
    await transaccionDocumental(actorId, motivo, /** Bloquea y comprueba custodia antes de anular lógicamente conservando el historial. */ async (cliente, actor) => {
        const documento = await documentoBloqueado(actor, id, cliente);
        if(clienteDocumental())await exigirEditable(actor,documento,cliente);
        else if(!(await repository.permisosContenido(actor,id,cliente)).anular)throw new HttpError(403,'No tiene permiso para anular este documento');
        await repository.anular(id, cliente);
    });
    return detalle(actorId, id);
}
/**
 * Dirección registra o retira su decisión sin cambiar PENDIENTE_DECISION ni crear un movimiento.
 * @param actorId - Cuenta autenticada que debe ser Director(a) de la oficina Dirección.
 * @param id - Documento activo y pendiente sobre el que se registra la decisión.
 * @param destinatario - Cuenta activa con oficina; null retira una autorización existente.
 * @param motivo - Justificación conservada en la auditoría de la misma transacción.
 * @returns Detalle autorizado después del commit; Mesa de Partes confirma la salida en otra operación.
 * @throws HttpError 403 por actor incompatible, 409 por estado o retiro inválidos y 400 por destino incompatible.
 */
export async function autorizar(actorId: string, id: string, destinatario: string | null, motivo: string) {
    await transaccionDocumental(actorId, motivo, /** Bloquea el documento y exige Dirección, estado pendiente y destino válido antes de escribir o retirar la tríada de autorización. */ async (cliente, actor) => {
        const documento = await documentoBloqueado(actor, id, cliente);
        if (documento.entrega) throw new HttpError(409, 'Utilice Asignar destinatario');
        if (actor.rol !== 'Director(a)' || !actor.oficina_id || await repository.oficinaNombre(actor.oficina_id, cliente) !== 'Dirección')
            throw new HttpError(403, 'Solo Direccion autoriza o retira la derivacion');
        if (documento.estado_tramite !== 'PENDIENTE_DECISION')
            throw new HttpError(409, 'El documento no espera decision');
        if (!destinatario && !documento.destinatario_autorizado_id)
            throw new HttpError(409, 'No existe autorizacion para retirar');
        const destino = destinatario ? await repository.destino(destinatario, cliente) : null;
        if (destinatario && (!destino || destinatario === documento.responsable_actual_id))
            throw new HttpError(400, 'Destinatario no valido');
        await repository.autorizar(id, destino?.id ?? null, destino?.oficina_id ?? null, destino ? actor.id : null, cliente);
    });
    return detalle(actorId, id);
}
/** Reinicia el circuito de Direccion cuando Mesa de Partes vuelve a tener el original. */
export async function solicitarDecision(actorId: string, id: string, motivo: string) {
    await transaccionDocumental(actorId, motivo, /** Exige custodia y circuito de Mesa de Partes antes de volver a solicitar decisión de Dirección. */ async (cliente, actor) => {
        if(!clienteDocumental()&&actor.rol==='Usuario')throw new HttpError(403,'Utilice la delegación personal');
        const documento = await documentoBloqueado(actor, id, cliente);
        await exigirEditable(actor, documento, cliente);
        if (documento.entrega) throw new HttpError(409, 'Este registro utiliza asignación y entrega');
        if (documento.estado_tramite !== 'RECIBIDO' || (actor.rol !== 'Secretaria de Dirección' && await repository.oficinaNombre(documento.oficina_responsable_id, cliente) !== 'Mesa de Partes'))
            throw new HttpError(409, 'Esta operacion corresponde a documentos recibidos en Mesa de Partes');
        await repository.solicitarDecision(id, cliente);
    });
    return detalle(actorId, id);
}


interface DestinoDecision {revision:number;oficina_id?:string|null;usuario_id?:string|null;nombre?:string|null;observaciones?:string|null}

/** Misma decisión para el detalle y para el registro, siempre dentro de la transacción del llamador. */
async function exigirDecision(actor:ActorDocumental,d:repository.Documento,revision:number,c:PoolClient) {
    if(clienteDocumental()||!d.entrega)throw new HttpError(409,'El registro no pertenece al flujo de decisión');
    if(!['Director(a)','Secretaria de Dirección'].includes(actor.rol) || (actor.rol==='Secretaria de Dirección' && d.registrado_por_id!==actor.id && await repository.rolRegistrador(d.id,c)!=='Director(a)'))throw new HttpError(403,'Decisión no autorizada');
    if(d.entrega.situacion!=='PENDIENTE_DECISION'||d.entrega.revision!==revision)throw new HttpError(409,'La decisión ya fue registrada');
}

async function aplicarDelegacion(c:PoolClient,actor:ActorDocumental,d:repository.Documento,datos:DestinoDecision) {
    await exigirDecision(actor,d,datos.revision,c);
    if((!datos.oficina_id&&!datos.usuario_id&&!datos.nombre)||(datos.usuario_id&&datos.nombre))throw new HttpError(400,'Indique oficina o persona');
    let nombre=datos.nombre;
    let oficinaNombre:string|null=null;
    if(datos.oficina_id){
        const o=(await c.query('SELECT nombre FROM oficinas WHERE id=$1 FOR SHARE',[datos.oficina_id])).rows[0];
        if(!o)throw new HttpError(400,'Oficina inexistente');oficinaNombre=o.nombre;
    }
    if(datos.usuario_id){
        const u=(await c.query("SELECT oficina_id::text,concat_ws(' ',nombre,apellido) nombre FROM usuarios WHERE id=$1 AND activo FOR SHARE",[datos.usuario_id])).rows[0];
        if(!u||(datos.oficina_id&&u.oficina_id!==datos.oficina_id))throw new HttpError(400,'Usuario y oficina incompatibles');nombre=u.nombre;
    }
    const tipo=datos.usuario_id?'USUARIO':datos.nombre?'PERSONA':'OFICINA';
    await c.query(`UPDATE entregas_secretaria SET situacion='DELEGADO',tipo=$2,oficina_id=$3,usuario_id=$4,
        destinatario=$5,asignado_por_id=$6,asignado_por_nombre=(SELECT concat_ws(' ',nombre,apellido) FROM usuarios WHERE id=$6),
        asignado_en=clock_timestamp(),observaciones_direccion=$7,revision=revision+1 WHERE documento_id=$1`,
        [d.id,tipo,datos.oficina_id??null,datos.usuario_id??null,[oficinaNombre,nombre].filter(Boolean).join(' · '),actor.id,datos.observaciones??null]);
}

async function aplicarGuardado(c:PoolClient,actor:ActorDocumental,d:repository.Documento,datos:{estante_id:string;archivador_id:string;revision:number}) {
    await exigirDecision(actor,d,datos.revision,c);
    const ubicacion=(await c.query("SELECT concat('Estante ',e.codigo,' / Archivador ',a.numero) nombre FROM archivadores a JOIN estantes e ON e.id=a.estante_id JOIN oficinas o ON o.id=e.oficina_id WHERE a.id=$1 AND e.id=$2 AND e.oficina_id=$3 AND ($4::boolean OR o.nombre='Dirección') FOR SHARE OF a,e,o",[datos.archivador_id,datos.estante_id,actor.oficina_id,actor.rol==='Secretaria de Dirección'])).rows[0];
    if(!ubicacion)throw new HttpError(400,'Seleccione un estante y archivador de su oficina');
    await c.query(`UPDATE entregas_secretaria SET situacion=$6,estante_direccion_id=$2,archivador_direccion_id=$3,
        ubicacion_direccion=$4,asignado_por_id=$5,asignado_por_nombre=(SELECT concat_ws(' ',nombre,apellido) FROM usuarios WHERE id=$5),
        asignado_en=clock_timestamp(),revision=revision+1 WHERE documento_id=$1`,[d.id,datos.estante_id,datos.archivador_id,ubicacion.nombre,actor.id,actor.rol==='Secretaria de Dirección'?'GUARDADO_SECRETARIA':'GUARDADO_DIRECCION']);
}

/** Secretaría confirma sus registros o los registrados por Dirección; nunca participa el destinatario. */
export async function gestionarEntrega(actorId:string,id:string,datos:DestinoDecision & {tipo?:'OFICINA'|'USUARIO'|'PERSONA'}) {
    await transaccionDocumental(actorId,datos.tipo?'Delegación':'Confirmación registrada de entrega física',async(c,actor)=>{
        const d=await documentoBloqueado(actor,id,c);
        if(datos.tipo){await aplicarDelegacion(c,actor,d,datos);return;}
        if(clienteDocumental()||!d.entrega)throw new HttpError(409,'El registro no pertenece al flujo de decisión');
        const registradoPorDireccion=await repository.rolRegistrador(id,c)==='Director(a)';
        if(actor.rol!=='Secretaria de Dirección'||(d.registrado_por_id!==actor.id&&!registradoPorDireccion))throw new HttpError(403,'No tiene permiso para confirmar esta entrega');
        if(d.entrega.situacion!=='DELEGADO'||d.entrega.revision!==datos.revision)throw new HttpError(409,'La entrega ya no está pendiente');
        await c.query(`UPDATE entregas_secretaria SET situacion='ENTREGADO',confirmado_por_id=$2,
            confirmado_por_nombre=(SELECT concat_ws(' ',nombre,apellido) FROM usuarios WHERE id=$2),confirmado_en=clock_timestamp(),
            revision=revision+1 WHERE documento_id=$1`,[id,actor.id]);
    });
    return detalle(actorId,id);
}

/** Decisión de ubicación sin transferir autoría ni edición de contenido. */
export async function guardarDireccion(actorId:string,id:string,datos:{estante_id:string;archivador_id:string;revision:number}) {
    await transaccionDocumental(actorId,'Ubicación en oficina',async(c,actor)=>{
        await aplicarGuardado(c,actor,await documentoBloqueado(actor,id,c),datos);
    });
    return detalle(actorId,id);
}

/** Delegación personal sin salida, aceptación ni modificación de custodia. */
export async function delegarPersonal(actorId:string,id:string,datos:z.infer<typeof delegacionPersonalSchema>){
 await transaccionDocumental(actorId,'Delegación personal',async(c,actor)=>{await documentoBloqueado(actor,id,c);await registrarDelegacionPersonal(c,actor,id,datos);});
 return detalle(actorId,id);
}
