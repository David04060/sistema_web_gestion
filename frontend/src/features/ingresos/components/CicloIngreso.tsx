import { useCallback, useState } from 'react';
import { useConsulta } from '../../../hooks/useConsulta';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { fechaLocal } from '../../../lib/fechas';
import * as api from '../api/ingresos.api';
import type { Ingreso } from '../schemas/ingresos.schema';
import ciclo from './CicloIngreso.module.css';
import styles from '../../../components/ui/Admin.module.css';

/** Historial paginado y comandos separados. Los borradores sobreviven a conflictos recuperables. */
export function CicloIngreso({ token, id, actualizar }: { token: string; id: string; actualizar: () => void }) {
 const [pagina,setPagina]=useState(1), [seleccion,setSeleccion]=useState('');
 const consulta=useConsulta(useCallback(()=>api.historia(token,id,pagina),[token,id,pagina]));
 const datos=consulta.datos, actual=datos?.ingreso;
 const elegido=datos?.ingresos.find(i=>i.id===seleccion) ?? actual ?? datos?.ingresos[0];
 const [mensaje,setMensaje]=useState('');
 return <section className={`${styles.tarjeta} ${ciclo.ciclo}`} aria-labelledby="ciclo-ingreso">
  <h2 id="ciclo-ingreso">Ingresos por Mesa de Partes</h2>
  <EstadoCarga {...consulta} reintentar={consulta.recargar}/>
  {mensaje && <p role="status">{mensaje}</p>}
  {datos && <>
   <p><strong>Ingreso vigente: {actual?.referencia ?? 'Ninguno'}</strong></p>
   <p>La conclusión y la invalidación corresponden al ingreso. La identidad y custodia del documento se conservan.</p>
   <ul>{datos.ingresos.map(i=><li key={i.id}><button className={styles.secundario} type="button" onClick={()=>setSeleccion(i.id)} aria-pressed={elegido?.id===i.id}>
    {i.referencia} · {i.fecha_conclusion?'Concluido':i.fecha_invalidacion?'Invalidado':'Abierto'} · {fechaLocal(i.fecha_ingreso)}</button></li>)}</ul>
   <p>{datos.total} ingresos · Página {pagina}</p>
   <button className={styles.secundario} disabled={pagina===1} onClick={()=>setPagina(p=>p-1)}>Ingresos anteriores: página previa</button>{' '}
   <button className={styles.secundario} disabled={pagina*datos.limite>=datos.total} onClick={()=>setPagina(p=>p+1)}>Más ingresos anteriores</button>
   {elegido && <DetalleIngreso key={elegido.id} token={token} id={id} ingreso={elegido} capacidades={datos.capacidades}
    terminado={()=>{setMensaje('Actuación registrada. Consulte el ingreso y su resultado actualizado.');consulta.recargar();actualizar();}}/>}
   <AuditoriaIngreso token={token} id={id}/>
   {datos.capacidades.reingresar && datos.ingresos[0] && pagina===1 && <FormularioIngreso token={token} id={id} ingreso={datos.ingresos[0].id} accion="reingresos"
    terminado={()=>{setMensaje('Nueva presentación registrada sobre el mismo original.');setSeleccion('');consulta.recargar();actualizar();}}/>}
  </>}
 </section>;
}
type Capacidades = {continuar:boolean; evidencia:boolean; concluir:boolean; invalidar:boolean};
function DetalleIngreso({token,id,ingreso:i,capacidades:c,terminado}:{token:string;id:string;ingreso:Ingreso;capacidades:Capacidades;terminado:()=>void}) {
 const [pagina,setPagina]=useState(1),[accion,setAccion]=useState<api.AccionIngreso|null>(null);
 const consulta=useConsulta(useCallback(()=>api.actuaciones(token,id,i.id,pagina),[token,id,i.id,pagina]));
 const abierto=!i.fecha_conclusion && !i.fecha_invalidacion;
 return <div>
  <h3>{i.referencia} · {i.ingreso_anterior_id?'Reingreso':'Primer ingreso'}</h3>
  <dl className={styles.datos}>
   <div><dt>Propósito</dt><dd>{i.proposito}</dd></div>
   <div><dt>Presentación</dt><dd>{fechaLocal(i.fecha_presentacion)} · {i.presentante} · {i.procedencia}</dd></div>
   <div><dt>Registro</dt><dd>{i.registradora} · {fechaLocal(i.fecha_ingreso)}</dd></div>
   {i.ingreso_anterior_id && <div><dt>Ingreso anterior</dt><dd>MP-{i.ingreso_anterior_id.padStart(6,'0')}</dd></div>}
   {i.fecha_conclusion && <><div><dt>Conclusión</dt><dd>{i.concluido_por} · {fechaLocal(i.fecha_conclusion)} · {i.motivo_conclusion}</dd></div><div><dt>Resultado acreditado</dt><dd>{i.resultado}</dd></div></>}
   {i.fecha_invalidacion && <div><dt>Invalidación de incorporación</dt><dd>{i.invalidado_por} · {fechaLocal(i.fecha_invalidacion)} · {i.motivo_invalidacion}</dd></div>}
  </dl>
  <h4>Continuaciones y evidencias del resultado</h4>
  <EstadoCarga {...consulta} reintentar={consulta.recargar}/>
  {consulta.datos?.actuaciones.map(a=><article key={a.id}><p><strong>{a.tipo==='CONTINUACION'?'Continuación':'Evidencia del resultado'}</strong> · {a.responsable} · {fechaLocal(a.fecha_actuacion)}</p>
   <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{a.descripcion}</p>
   {a.tipo==='EVIDENCIA_RESULTADO' && <p>Confirmación de tenencia · {a.vigente?'Custodia vigente':'Referencia histórica; requiere nueva confirmación para concluir'}</p>}</article>)}
  {consulta.datos && <p><button className={styles.secundario} disabled={pagina===1} onClick={()=>setPagina(p=>p-1)}>Actuaciones: página previa</button>{' '}Página {pagina} · {consulta.datos.total} actuaciones{' '}
   <button className={styles.secundario} disabled={pagina*consulta.datos.limite>=consulta.datos.total} onClick={()=>setPagina(p=>p+1)}>Más actuaciones</button></p>}
  {abierto && <div className={styles.acciones}>
   {c.continuar && <button className={styles.secundario} onClick={()=>setAccion('continuaciones')}>Registrar continuación</button>}
   {c.evidencia && <button className={styles.secundario} onClick={()=>setAccion('evidencias')}>Confirmar resultado y tenencia</button>}
   {c.concluir && <button className={styles.secundario} onClick={()=>setAccion('conclusion')}>Formalizar conclusión</button>}
   {c.invalidar && <button className={styles.secundario} onClick={()=>setAccion('invalidacion')}>Invalidar incorporación equivocada</button>}
  </div>}
  {abierto && accion && <FormularioIngreso key={accion} token={token} id={id} ingreso={i.id} accion={accion} evidencias={consulta.datos?.actuaciones.filter(a=>a.tipo==='EVIDENCIA_RESULTADO' && a.vigente)} terminado={()=>{consulta.recargar();setAccion(null);terminado();}}/>}
 </div>;
}
/** Enviar es una confirmación explícita; no desmonta ni limpia campos ante un error. */
function FormularioIngreso({token,id,ingreso,accion,terminado,evidencias=[]}:{token:string;id:string;ingreso:string;accion:api.AccionIngreso;terminado:()=>void;evidencias?:{id:string;responsable:string;fecha_actuacion:string;descripcion:string}[]}) {
 const [error,setError]=useState(''),[enviando,setEnviando]=useState(false);
 const titulo={continuaciones:'Registrar continuación',evidencias:'Confirmar resultado y tenencia del original',conclusion:'Formalizar conclusión con evidencia vigente',invalidacion:'Invalidar incorporación equivocada',reingresos:'Registrar una nueva presentación'}[accion];
 return <form className={styles.tarjeta} onSubmit={async e=>{
  e.preventDefault();const f=new FormData(e.currentTarget);setEnviando(true);setError('');
  const texto=(n:string)=>String(f.get(n)??'').trim();
  const body=accion==='reingresos'?{ingreso_anterior_id:ingreso,presentante:texto('presentante'),procedencia:texto('procedencia'),proposito:texto('proposito'),confirmar_presentacion:true,...(texto('movimiento_recepcion_id')?{movimiento_recepcion_id:texto('movimiento_recepcion_id')}:{})}
   :accion==='continuaciones'?{descripcion:texto('descripcion')}:accion==='evidencias'?{descripcion:texto('descripcion'),confirmar_tenencia:true}
   :{motivo:texto('motivo'),confirmar:true,...(accion==='conclusion'?{evidencia_id:texto('evidencia_id')}:{})};
  try {await api.operar(token,id,ingreso,accion,body);terminado();}catch(e){setError(e instanceof Error?e.message:'No se pudo registrar la operación');}finally{setEnviando(false);}
 }}>
  <h4>{titulo}</h4>
  {accion==='reingresos'?<>
   <label className={styles.campo}>Presentante<input name="presentante" required maxLength={250}/></label>
   <label className={styles.campo}>Procedencia<textarea name="procedencia" required maxLength={2000}/></label>
   <label className={styles.campo}>Nuevo propósito<textarea name="proposito" required maxLength={20000}/></label>
   <p>Si el original ya está en Secretaría, confirme su nueva presentación ahora. No se creará otro traslado ni se reutilizará una recepción antigua.</p>
  </>:accion==='continuaciones'||accion==='evidencias'?<label className={styles.campo}>{accion==='evidencias'?'Resultado de la gestión':'Descripción de la continuación'}<textarea name="descripcion" required maxLength={20000}/></label>:<>
   <label className={styles.campo}>Motivo<textarea name="motivo" required maxLength={1000}/></label>
   {accion==='conclusion' && <label className={styles.campo}>Evidencia vigente del custodio<select name="evidencia_id" required defaultValue=""><option value="">Seleccione la confirmación del resultado</option>{evidencias.map(e=><option key={e.id} value={e.id}>{e.responsable} · {fechaLocal(e.fecha_actuacion)} · {e.descripcion.slice(0,100)}</option>)}</select></label>}
   {accion==='conclusion' && !evidencias.length && <p>Solicite al custodio que confirme el resultado y la tenencia del original antes de concluir. Las evidencias vigentes se muestran en la página de actuaciones seleccionada.</p>}
  </>}
  {accion!=='continuaciones' && <label className={styles.campo}><input type="checkbox" required/> {accion==='evidencias'?'Confirmo el resultado y que tengo físicamente el original.':accion==='reingresos'?'Confirmo la presentación física actual del original bajo mi custodia.':accion==='invalidacion'?'Confirmo que la incorporación fue equivocada. Se conservarán las recepciones, los movimientos y la historia.':'Confirmo la conclusión de este ingreso con el resultado de la evidencia indicada.'}</label>}
  {error && <p role="alert">{error}</p>}
  <button className={styles.boton} type="submit" disabled={enviando}>{enviando?'Registrando…':titulo}</button>
 </form>;
}

function AuditoriaIngreso({token,id}:{token:string;id:string}) {
 const [abierta,setAbierta]=useState(false),[pagina,setPagina]=useState(1);
 const consulta=useConsulta(useCallback(()=>api.auditoria(token,id,pagina),[token,id,pagina]),{habilitada:abierta});
 return <details onToggle={e=>setAbierta(e.currentTarget.open)}><summary>Auditoría de ingresos y actuaciones</summary>
 {abierta && <><EstadoCarga {...consulta} reintentar={consulta.recargar}/>{consulta.datos?.auditoria.map(a=><p key={a.id}>{a.accion==='CREAR'?'Registro':'Formalización del desenlace'} · {a.responsable} · {fechaLocal(a.fecha)}</p>)}
 {consulta.datos && <p><button className={styles.secundario} disabled={pagina===1} onClick={()=>setPagina(p=>p-1)}>Auditoría: página previa</button> Página {pagina} · {consulta.datos.total} hechos <button className={styles.secundario} disabled={pagina*consulta.datos.limite>=consulta.datos.total} onClick={()=>setPagina(p=>p+1)}>Más auditoría</button></p>}</>}
 </details>;
}
