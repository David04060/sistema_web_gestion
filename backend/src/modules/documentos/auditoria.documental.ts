const etiquetas:Record<string,string>={PERSONAL:'Personal',PENDIENTE_DIRECCION:'Pendiente de Dirección',EN_MESA_DE_PARTES:'En Mesa de Partes',GUARDADO_DIRECCION:'Guardado en Dirección',DELEGADO:'Delegado',ANULADO:'Anulado',RECIBIDO:'Recibido',EMITIDO:'Emitido'};
/** Lista permitida: nunca devuelve claves R2, IDs de cuenta ni JSON interno. */
export function datosAuditoria(anterior:unknown,posterior:unknown){
 const a=anterior&&typeof anterior==='object'?anterior as Record<string,unknown>:{},b=posterior&&typeof posterior==='object'?posterior as Record<string,unknown>:{};
 const campos:Record<string,string>={codigo_visible:'Código documental',tipo_nombre_guardado:'Tipo documental',clasificacion:'Clasificación',asunto:'Asunto',remitente:'Remitente',observaciones:'Observaciones',situacion:'Situación',nombre:'Nombre del PDF',tamano_bytes:'Tamaño del PDF (bytes)',persona:'Persona indicada',ruta:'Ubicación'};
 if('valor' in a||'valor' in b)campos.valor=String(b.nombre_guardado??a.nombre_guardado??'Campo opcional');
 const texto=(v:unknown)=>typeof v==='string'&&v.trim()?etiquetas[v]??v:typeof v==='number'?String(v):null;
 return Object.entries(campos).flatMap(([k,campo])=>{const antes=texto(a[k]),despues=texto(b[k]);return antes===despues?[]:[{campo,anterior:antes,posterior:despues}];});
}
