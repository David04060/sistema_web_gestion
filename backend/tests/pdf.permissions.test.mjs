import assert from 'node:assert/strict';
import {test} from 'node:test';
import {puedeGestionarPdfInstitucional as permiso} from '../dist/modules/documentos-pdf/pdf.permissions.js';
for(const rol of ['Director(a)','Secretaria de Dirección']){
const actor={id:'2',rol,activo:true};const d={activo:true,estado_tramite:'RECIBIDO',oficina:'Mesa de Partes'};
test(rol+': responsable vigente carga en guardado y delegación sin transferencia',()=>{
for(const situacion of ['GUARDADO_SECRETARIA','GUARDADO_DIRECCION','DELEGADO','ENTREGADO'])
assert.equal(permiso(actor,{...d,responsable_actual_id:actor.id},{situacion,tipo:'USUARIO',usuario_id:'4'}),true);
for(const cambio of [{activo:false},{estado_tramite:'EN_TRASLADO'}])
assert.equal(permiso(actor,{...d,responsable_actual_id:actor.id,...cambio},{situacion:'DELEGADO',tipo:'USUARIO',usuario_id:'4'}),false);
assert.equal(permiso(actor,{...d,responsable_actual_id:'4'},{situacion:'DELEGADO',tipo:'USUARIO',usuario_id:'4'}),false);
});
test(rol+': pendiente, Dirección, Mesa y documentos antiguos',()=>{
assert.equal(permiso(actor,{...d,estado_tramite:'PENDIENTE_DECISION'}),rol==='Secretaria de Dirección');
assert.equal(permiso(actor,{...d,oficina:'Dirección'}),rol==='Secretaria de Dirección');
assert.equal(permiso(actor,d),rol==='Secretaria de Dirección');
assert.equal(permiso(actor,d,{situacion:'GUARDADO_DIRECCION'}),rol==='Secretaria de Dirección');
assert.equal(permiso(actor,d,{situacion:'GUARDADO_SECRETARIA'}),rol==='Secretaria de Dirección');
});
for(const situacion of ['DELEGADO','ENTREGADO'])test(rol+': '+situacion+' distingue usuario, oficina y nombre manual',()=>{
for(const tipo of ['USUARIO','OFICINA','PERSONA'])assert.equal(permiso(actor,d,{situacion,tipo,usuario_id:tipo==='USUARIO'?'4':null}),tipo==='PERSONA'&&rol==='Secretaria de Dirección');
});
test(rol+': anulado, traslado y otra oficina denegados',()=>{
for(const cambio of [{activo:false},{estado_tramite:'EN_TRASLADO'},{oficina:'Otra oficina'}])assert.equal(permiso(actor,{...d,...cambio}),false);
});
}
