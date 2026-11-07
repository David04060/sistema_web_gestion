import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'vite';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
// Render de componentes reales con respuestas en memoria. No sustituye navegador.
const doc={id:'4',revision:'1',codigo_visible:'PRUEBA4',asunto:'Asunto largo para revisar la lectura de documentos sin cortar palabras ni omitir información. '.repeat(8),registrado_por_nombre:'Directora local',clasificacion:'EMITIDO',tipo_nombre_guardado:'Informe',situacion:'PENDIENTE_DIRECCION',creado_en:'2026-11-01T15:00:00Z',remitente:null,observaciones:null,ubicacion:null,delegacion:null,valores:[],relacionados:[],permisos:{corregir:true,relacionar:true,delegar:true,ubicar:true,anular:true}};
const historia=[{id:'4',accion:'REGISTRO',actor:'Directora local',fecha:'2026-11-01T15:00:00Z',motivo:null,anterior:null,posterior:{asunto:'Detalle de prueba'}},{id:'7',accion:'DELEGACION',actor:'Directora local',fecha:'2026-11-01T15:05:00Z',motivo:null,anterior:null,posterior:{persona:'Persona indicada'}}];
const cuenta={id:'3',nombre:'Cuenta',apellido:'Prueba',nombre_usuario:'cuenta_prueba',email:null,telefono:null,rol_id:5,oficina_id:null,rol:'Usuario',oficina:null,activo:true};
const datos={responsable:{id:'3',nombre:'Responsable sintético',version_autenticacion:1},candidatos:[{id:'7',nombre:'Reemplazo sintético',version_autenticacion:2}],id:'9',nombre:'Oficina ordinaria',activa:true,oficina:{id:'9',nombre:'Oficina ordinaria',activa:true},cuenta,usuario:cuenta,usuarios:[cuenta,{...cuenta,id:'4',rol_id:3,rol:'Director(a)'},{...cuenta,id:'5',rol_id:4,rol:'Secretaria de Dirección'}],roles:[{id:3,nombre:'Director(a)'},{id:4,nombre:'Secretaria de Dirección'},{id:5,nombre:'Usuario'}],detalle:{documento:doc},historial:{historial:historia},documentos:[doc],total:1,pagina:1,limite:20,unidades:[{id:'100',propietario_id:'3',oficina_id:'1',clase:'Lugar',nombre:'Estante de prueba',padre_id:null,activo:true},{id:'101',propietario_id:'3',oficina_id:'1',clase:'Archivador',nombre:'Informes de marzo',padre_id:'100',activo:true}],tipos:[],campos:[],oficinas:[{id:'1',nombre:'Dirección',activa:true},{id:'2',nombre:'Mesa de Partes',activa:true},{id:'9',nombre:'Oficina ordinaria',activa:true}],destinatarios:[]};
const entrada=`
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {DocumentoDetallePage} from '${resolve('src/features/documentos/pages/DocumentoDetallePage.tsx').split(String.fromCharCode(92)).join('/')}';
import {DocumentosListaPage} from '${resolve('src/features/documentos/pages/DocumentosListaPage.tsx').split(String.fromCharCode(92)).join('/')}';
import {UsuarioFormularioPage} from '${resolve('src/features/usuarios/pages/UsuarioFormularioPage.tsx').split(String.fromCharCode(92)).join('/')}';
import {UsuarioDetallePage} from '${resolve('src/features/usuarios/pages/UsuarioDetallePage.tsx').split(String.fromCharCode(92)).join('/')}';
import {UsuariosListaPage} from '${resolve('src/features/usuarios/pages/UsuariosListaPage.tsx').split(String.fromCharCode(92)).join('/')}';
import {UbicacionesPage} from '${resolve('src/features/ubicaciones/pages/UbicacionesPage.tsx').split(String.fromCharCode(92)).join('/')}';
import {OficinasActualesPage} from '${resolve('src/features/usuarios/pages/OficinasListaPage.tsx').split(String.fromCharCode(92)).join('/')}';
import {OficinaDetallePage} from '${resolve('src/features/usuarios/pages/OficinaDetallePage.tsx').split(String.fromCharCode(92)).join('/')}';
import {OficinaFormularioPage} from '${resolve('src/features/usuarios/pages/OficinaFormularioPage.tsx').split(String.fromCharCode(92)).join('/')}';
import {DocumentoFormularioPage} from '${resolve('src/features/documentos/pages/DocumentoFormularioPage.tsx').split(String.fromCharCode(92)).join('/')}';
import {PrevisualizacionRegistroPdf} from '${resolve('src/features/documentos/components/PrevisualizacionRegistroPdf.tsx').split(String.fromCharCode(92)).join('/')}';
import {AccionesDocumento} from '${resolve('src/features/documentos/components/AccionesDocumento.tsx').split(String.fromCharCode(92)).join('/')}';
import {GrupoDocumental} from '${resolve('src/features/documentos/components/GrupoDocumental.tsx').split(String.fromCharCode(92)).join('/')}';
import {Formulario as FormularioCuenta} from '${resolve('src/features/usuarios/pages/UsuarioFormularioPage.tsx').split(String.fromCharCode(92)).join('/')}';
import {elegir} from 'virtual:estado';
function inspeccionar(elemento){if(!React.isValidElement(elemento))return;const hijos=[elemento.props.children].flat(Infinity).filter(React.isValidElement);const claves=hijos.filter(h=>h.key!==null).map(h=>h.key);if(new Set(claves).size!==claves.length)throw Error('Claves hermanas duplicadas: '+claves.join(','));hijos.forEach(inspeccionar);}
function Detalle(){const arbol=DocumentoDetallePage();inspeccionar(arbol);return arbol;}
export function renderizar(pantalla,cuentaCampo='',mensaje=''){elegir(pantalla);const componentes={detalle:Detalle,listado:DocumentosListaPage,docRegistro:DocumentoFormularioPage,usuarioForm:UsuarioFormularioPage,usuarioDetalle:UsuarioDetallePage,usuarios:UsuariosListaPage,ubicaciones:UbicacionesPage,oficinas:OficinasActualesPage,oficinaDetalle:OficinaDetallePage,oficinaForm:OficinaFormularioPage};const path=pantalla.startsWith('oficina')?'/oficinas/:id':pantalla.startsWith('usuario')?'/usuarios/:id':pantalla==='docRegistro'?'/documentos/nuevo':'/documentos/:id';const url=pantalla.startsWith('oficina')?'/oficinas/9':pantalla.startsWith('usuario')?'/usuarios/3':pantalla==='docRegistro'?'/documentos/nuevo':'/documentos/4';return renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:[mensaje?{pathname:url,state:{mensaje}}:url+(pantalla==='listado'&&cuentaCampo?'?'+cuentaCampo:'')]},React.createElement(Routes,null,React.createElement(Route,{path,element:React.createElement(componentes[pantalla])}))));}
export function grupo(grupo){return renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(GrupoDocumental,{documento:{id:'4',grupo,relacionados:[]}})));}
export function usuarioSinAsignar(rol){return renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(FormularioCuenta,{token:'sintetico',inicial:{rol_id:rol,oficina_id:null},roles:[{id:3,nombre:'Dirección'},{id:4,nombre:'Secretaría'}],oficinas:[{id:'1',nombre:'Dirección',activa:true},{id:'2',nombre:'Mesa de Partes',activa:true}]})));}
export function acciones(ubicacion,permitir){return renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(AccionesDocumento,{token:'sintetico',documento:{id:'4',revision:'1',ubicacion,permisos:{delegar:false,ubicar:permitir,anular:false}},actualizar:()=>{}})));}
export function previsualizar(){return renderToStaticMarkup(React.createElement(PrevisualizacionRegistroPdf,{archivo:{name:'archivo seleccionado.pdf',size:1048576},bytes:new Uint8Array(),ocupado:false,quitar:()=>{}}));}

`;
const r=await build({configFile:false,logLevel:'silent',plugins:[{name:'render-documental',enforce:'pre',resolveId(i){if(i==='virtual:render'||i==='virtual:consulta'||i==='virtual:auth'||i==='virtual:estado')return '\0'+i;if(i.endsWith('/hooks/useConsulta'))return '\0virtual:consulta';if(i.endsWith('/hooks/useAuth'))return '\0virtual:auth';if(i.endsWith('/VisorPdf'))return '\0virtual:visor';},load(i){if(i==='\0virtual:render')return entrada;if(i==='\0virtual:estado')return "export let pantalla='detalle';export function elegir(v){pantalla=v}";if(i==='\0virtual:visor')return 'export default function Visor(){return null}';if(i==='\0virtual:consulta')return `import {pantalla} from 'virtual:estado';const datos=${JSON.stringify(datos)};export function useConsulta(){return {datos:pantalla==='docRegistro'?{opciones:datos,detalle:null,origen:null}:pantalla==='oficinaForm'?datos.oficina:datos,cargando:false,actualizando:false,error:'',recargar:()=>{}}}`;if(i==='\0virtual:auth')return `export function useAuth(){return {sesion:{token:'solo-render-en-memoria',usuario:{id:'3',rol:'Director(a)',oficina_id:'1'}},revisionAcceso:0}}`;}}],build:{ssr:true,write:false,minify:false,rollupOptions:{input:'virtual:render',preserveEntrySignatures:'strict',output:{format:'es',codeSplitting:false}}}});
const chunk=r.output.find(c=>c.type==='chunk'&&c.isEntry);
mkdirSync('.private/render-documental',{recursive:true});
const archivo=resolve('.private/render-documental/entrada.mjs');writeFileSync(archivo,chunk.code);
const {renderizar,previsualizar,acciones,grupo,usuarioSinAsignar}=await import(pathToFileURL(archivo).href);
test('Detalle real renderizado: PDF y acciones tienen claves distintas; historial muestra todos los eventos',()=>{
 const html=renderizar('detalle');assert.ok(html.includes('Confirmar delegación'));assert.ok(html.includes('Archivo PDF'));
 assert.ok(!html.includes('La delegación deja constancia'));assert.equal((html.match(/data-evento=/g)??[]).length,2);for(const h of historia)assert.ok(html.includes('data-evento="'+h.id+'"'));
 assert.ok(html.includes('Persona indicada'));assert.ok(html.includes('Directora local'));assert.ok(html.includes('<time'));assert.match(html,/<a class="[^"]+" href="\/documentos"[^>]*>Volver al listado/);
});
test('Listado real renderizado: Buscar es un botón con clase específica y registro tiene entrada única',()=>{
 const html=renderizar('listado');assert.match(html,/<button class="[^"]*buscarDocumentos[^"]*">Buscar<\/button>/);assert.equal((html.match(/>Registrar documento<\/a>/g)??[]).length,1);
});
test('Mejoras de presentación: enlaces de detalle, resumen sin comparaciones iniciales y auditoría expandible',()=>{
 const html=renderizar('detalle'),registro=html.split('data-evento="4"')[1].split('</article>')[0];assert.ok(!registro.includes(' → '));assert.ok(html.includes('Ver más detalles'));
 const listado=renderizar('listado');assert.ok(listado.includes('Ver detalle'));assert.equal((listado.match(/href="\/documentos\/4"/g)??[]).length,2);
});
test('Administración renderizada: dos columnas, oficinas compatibles, edición en detalle y actividad separada',()=>{
 const form=renderizar('usuarioForm');assert.ok(form.includes('formularioDosColumnas'));assert.ok(!form.includes('Cuenta activa'));assert.ok(!form.includes('>Dirección</option>'));assert.ok(!form.includes('>Mesa de Partes</option>'));assert.ok(form.includes('Oficina ordinaria'));
 const listado=renderizar('usuarios');assert.ok(listado.includes('/usuarios/3'));assert.ok(!listado.includes('>Editar</a>'));
 const detalle=renderizar('usuarioDetalle');assert.equal((detalle.match(/>Editar cuenta y asignación<\/a>/g)??[]).length,1);assert.ok(detalle.includes('Desactivar cuenta'));assert.ok(detalle.includes('Motivo'));
});
test('Lugares: raíz independiente y contenido identificado',()=>{
 const ubicaciones=renderizar('ubicaciones');assert.ok(ubicaciones.includes('Crear lugar'));assert.ok(ubicaciones.includes('Agregar contenido a un lugar'));assert.ok(ubicaciones.includes('Nombre del lugar'));assert.ok(!ubicaciones.includes('Clase libre'));assert.ok(ubicaciones.includes('Estante de prueba'));assert.ok(ubicaciones.includes('Informes de marzo'));
});
test('Oficinas en vistas separadas: listado sin formulario, nombre sin checkbox y actividad independiente',()=>{
 const lista=renderizar('oficinas');assert.ok(lista.includes('/oficinas/9'));assert.ok(!lista.includes('<form'));
 const editar=renderizar('oficinaForm');assert.ok(editar.includes('Editar nombre de oficina'));assert.ok(!editar.includes('type="checkbox"'));assert.ok(!editar.includes('Desactivar oficina'));assert.ok(!editar.includes('protegidas por el backend'));
 const detalle=renderizar('oficinaDetalle');assert.ok(detalle.includes('/oficinas/9/editar'));assert.ok(detalle.includes('Desactivar oficina'));assert.ok(detalle.includes('Motivo'));
});
test('Registro y previsualización: máximo dos columnas y metadatos separados sin anunciar una subida',()=>{
 const form=renderizar('docRegistro');assert.ok(form.includes('formularioDosColumnas'));assert.ok(form.includes('campoCompleto'));assert.ok(form.includes('Clasificación'));assert.ok(form.includes('PDF opcional'));
 const preview=previsualizar();assert.ok(preview.includes('archivo seleccionado.pdf'));assert.ok(preview.includes('1 MiB'));assert.ok(preview.includes('Aún no enviado.'));assert.ok(preview.includes('metadatosPdf'));assert.ok(preview.includes('bloqueVisorPdf'));
});
test('Accesos visibles y estructura de tarjetas documental sin duplicar las filas ni los enlaces',()=>{
 const cuentas=renderizar('usuarios');assert.ok(cuentas.includes('>Ver detalle</a>'));assert.equal((cuentas.match(/href="\/usuarios\/3"/g)??[]).length,2);
 const docs=renderizar('listado');assert.ok(docs.includes('tablaDocumentos'));for(const etiqueta of ['Código','Asunto','Clasificación','Situación','Registrado por','Ubicación','Acciones'])assert.ok(docs.includes('data-label="'+etiqueta+'"'));assert.ok(docs.includes(doc.asunto));
});



test('Filtros de registro: tres precisiones, criterios activos, limpiar y fecha visible en móvil',()=>{
 const html=renderizar('listado','q=RVINT2026001&fecha=2026-11-01&clasificacion=RECIBIDO');
 for(const texto of ['Día concreto','Mes y año','Año completo','Limpiar filtros','Filtros activos','Registro: 2026-11-01','Código o asunto: RVINT2026001'])assert.ok(html.includes(texto),texto);
 assert.ok(html.includes('aria-label="Periodo de registro"'));assert.ok(html.includes('data-label="Registro"'));
});

test('Las confirmaciones de registro, corrección y anulación llegan a la pantalla de destino',()=>{
 for(const [pantalla,mensaje] of [['detalle','Documento registrado.'],['detalle','Datos corregidos.'],['listado','Registro anulado. Se conserva su historial.']]){const html=renderizar(pantalla,'',mensaje);assert.ok(html.includes(mensaje));assert.ok(html.includes('role="status"'));}
});

test('Acción de ubicación: texto por ubicación vigente y permiso',()=>{assert.ok(acciones(null,true).includes('Guardar en una ubicación propia'));assert.ok(acciones({unidad_id:'1'},true).includes('Actualizar ubicación'));for(const ubicacion of [null,{unidad_id:'1'}]){const html=acciones(ubicacion,false);assert.ok(!html.includes('Guardar en una ubicación propia'));assert.ok(!html.includes('Actualizar ubicación'));}});

test('Registro relacionado, filtro y relevo aparecen en los componentes reales',()=>{
 assert.ok(renderizar('docRegistro').includes('Registrar documento relacionado'));
 assert.match(renderizar('listado','con_relacionados=true'), /<option value="RELACIONADOS" selected="">Documentos relacionados<\/option>/);
 assert.ok(renderizar('oficinaDetalle').includes('Relevo de responsable'));
});

test('Relevo renderizado exige motivo y distingue archivo histórico de ubicaciones personales',()=>{const html=renderizar('oficinaDetalle');for(const texto of ['Responsable sintético','Reemplazo sintético','Motivo del relevo','Revisar relevo','Los estantes y archivadores personales no se transfieren.'])assert.ok(html.includes(texto),texto);assert.ok(html.includes('required=""'));});

test('Grupo renderizado distingue primer registro, actual y origen no visible sin enlaces inventados',()=>{const primero={id:'2',codigo_visible:'INF2026001',asunto:'Inicio sintético',origen_id:null,creado_en:'2026-11-01T15:00:00Z'},actual={id:'4',codigo_visible:'INF2026002',asunto:'Continuación sintética',origen_id:'2',creado_en:'2026-11-02T15:00:00Z'};const html=grupo({primero_id:'2',inicio_visible:true,documentos:[primero,actual]});assert.ok(html.includes('Primer documento registrado:'));assert.ok(html.includes('href="/documentos/2"'));assert.ok(html.includes('documento actual'));assert.ok(!html.includes('href="/documentos/4"'));const privado=grupo({primero_id:null,inicio_visible:false,documentos:[{...actual,origen_id:null}]});assert.ok(privado.includes('Documento inicial no disponible con tus permisos.'));assert.ok(!privado.includes('INF2026001'));assert.ok(!privado.includes('href="/documentos/2"'));});

test('Candidatos institucionales: Sin asignar disponible sin seleccionar automáticamente una oficina',()=>{for(const rol of [3,4]){const html=usuarioSinAsignar(rol);assert.ok(html.includes('<option value="" selected="">Sin asignar</option>'));assert.ok(!html.includes('Oficina obligatoria'));const selects=html.match(/<select[^>]*>[\s\S]*?<\/select>/g);assert.ok(selects.some(s=>s.includes('Sin asignar')&&!s.includes('required=""')));}});
