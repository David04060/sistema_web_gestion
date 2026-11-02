import {useId} from 'react';
import {etiquetas,type EstadisticasDashboard} from '../../../api/documental';
import admin from '../../../components/ui/Admin.module.css';
import styles from './GraficosDashboard.module.css';

type Conteo={etiqueta:string;total:number};
type Grupo=Extract<EstadisticasDashboard,{grupos_documentales:unknown}>['grupos_documentales'][number];
const numero=(n:number)=>n.toLocaleString('es-PE');
const porcentaje=(n:number,total:number)=>total?((n/total)*100).toLocaleString('es-PE',{maximumFractionDigits:1}):'0';
const mes=(valor:string)=>new Intl.DateTimeFormat('es-PE',{month:'short',year:'numeric',timeZone:'America/Lima'}).format(new Date(valor+'-15T12:00:00Z'));
const fecha=(valor:string)=>new Intl.DateTimeFormat('es-PE',{day:'numeric',month:'short',year:'numeric',timeZone:'America/Lima'}).format(new Date(valor));

function Barras({datos,total,titulo,descripcion}:{datos:Conteo[];total:number;titulo:string;descripcion:string}) {
 const id=useId(),maximo=Math.max(1,...datos.map(d=>d.total));
 return <section className={styles.panel} aria-labelledby={id}><h3 id={id}>{titulo}</h3><p className={styles.ayuda}>{descripcion}</p>{total===0?<p className={admin.vacio}>Sin datos para esta distribución.</p>:<ol className={styles.barras}>{datos.map(d=><li key={d.etiqueta}><div><span>{d.etiqueta}</span><strong>{numero(d.total)} <small>({porcentaje(d.total,total)} %)</small></strong></div><span className={styles.pista} aria-hidden="true"><span style={{width:(d.total/maximo*100)+'%'}}/></span></li>)}</ol>}<p className={styles.ayuda}>Base: {numero(total)} en total. El largo de cada barra compara cantidades.</p></section>;
}

function SerieMensual({grupo}:{grupo:Grupo}) {
 const id=useId(),datos=grupo.meses,max=Math.max(1,...datos.map(m=>m.total));
 const registros=datos.reduce((n,m)=>n+m.total,0),mostrarAnulados=grupo.anulados>0;
 const x=(i:number)=>52+(datos.length>1?i/(datos.length-1)*520:260),y=(n:number)=>180-n/max*140;
 const puntos=(campo:'vigentes'|'anulados')=>datos.map((m,i)=>x(i)+','+y(m[campo])).join(' ');
 return <section className={styles.panel} aria-labelledby={id}><h3 id={id}>Registros por mes</h3><p className={styles.ayuda}>{numero(registros)} registros dentro del periodo, según fecha de registro y situación actual. Mes actual parcial.</p>
 {registros===0?<p className={admin.vacio}>Sin registros en este periodo.</p>:<>
 <div className={styles.leyenda}><span><i/>Vigentes</span>{mostrarAnulados&&<span className={styles.anulados}><i/>Anulados</span>}</div>
 <svg className={styles.serie} viewBox="0 0 620 240" role="img" aria-labelledby={id+'-titulo '+id+'-descripcion'}><title id={id+'-titulo'}>{`Registros mensuales de ${grupo.etiqueta}`}</title><desc id={id+'-descripcion'}>{numero(registros)} registros en el periodo. Cantidades exactas disponibles en la tabla y en la lista móvil. La línea discontinua representa anulados.</desc>
 {[...new Set([0,Math.ceil(max/2),max])].map(n=><g key={n}><line className={styles.rejilla} x1="50" x2="580" y1={y(n)} y2={y(n)}/><text x="40" y={y(n)+5} textAnchor="end">{numero(n)}</text></g>)}
 <polyline className={styles.linea} points={puntos('vigentes')}/>{mostrarAnulados&&<polyline className={styles.lineaAnulados} points={puntos('anulados')}/>}
 {datos.map((m,i)=><g key={m.mes}><circle className={styles.punto} cx={x(i)} cy={y(m.vigentes)} r="4"/>{mostrarAnulados&&<rect className={styles.puntoAnulados} x={x(i)-4} y={y(m.anulados)-4} width="8" height="8"/>}{((i%2===0&&i<datos.length-2)||i===datos.length-1)&&<text x={x(i)} y="214" textAnchor="middle">{mes(m.mes)}</text>}</g>)}
 </svg><ol className={styles.serieMovil} aria-label="Registros mensuales">{datos.map(m=><li key={m.mes}><span>{mes(m.mes)}</span><strong>{numero(m.total)}</strong>{mostrarAnulados&&<small>{numero(m.vigentes)} vigentes · {numero(m.anulados)} anulados</small>}</li>)}</ol></>}
 <details className={styles.tablaDatos}><summary>Consultar tabla de registros por mes</summary><table><caption>Zona horaria: America/Lima. Cantidades de documentos, sin porcentajes.</caption><thead><tr><th scope="col">Mes</th><th scope="col">Vigentes</th>{mostrarAnulados&&<th scope="col">Anulados</th>}<th scope="col">Total</th></tr></thead><tbody>{datos.map(m=><tr key={m.mes}><th scope="row"><time dateTime={m.mes}>{mes(m.mes)}</time></th><td>{numero(m.vigentes)}</td>{mostrarAnulados&&<td>{numero(m.anulados)}</td>}<td>{numero(m.total)}</td></tr>)}</tbody></table></details></section>;
}

function Documental({grupo}:{grupo:Grupo}) {
 const id=useId();
 return <section className={admin.tarjeta} aria-labelledby={id}><header className={styles.cabecera}><div><h2 id={id}>{grupo.etiqueta}</h2><p>{grupo.clave==='personales_ajenos'?'Consulta institucional: este grupo no concede permisos de modificación.':'Documentos del ámbito indicado.'} Los grupos no se superponen.</p></div><p className={styles.total}><strong>{numero(grupo.total)}</strong> documentos</p></header>
 {grupo.total===0?<p className={admin.vacio}>Sin documentos en este ámbito.</p>:<>{['compartido','personales_ajenos'].includes(grupo.clave)&&<div className={styles.situaciones} aria-label="Distribución por situación, todo el historial">{grupo.situaciones.map(s=><div key={s.etiqueta}><span>{etiquetas[s.etiqueta]??s.etiqueta}</span><strong>{numero(s.total)} <small>({porcentaje(s.total,grupo.total)} %)</small></strong></div>)}</div>}{grupo.anulados>0&&<p className={styles.ayuda}>{numero(grupo.vigentes)} vigentes y {numero(grupo.anulados)} anulados. Los tipos comparan únicamente vigentes; la serie temporal distingue ambos.</p>}
 <div className={styles.grid}><Barras datos={grupo.tipos} total={grupo.vigentes} titulo="Tipos documentales" descripcion="¿Qué tipos se utilizan? Todo el historial vigente; agrupado por el nombre registrado."/><SerieMensual grupo={grupo}/></div></>}
 </section>;
}

function ActividadCuentas({datos}:{datos:Conteo[]}) {
 const id=useId(),total=datos.reduce((n,d)=>n+d.total,0),activas=datos[0]?.total??0,fraccion=total?activas/total:0;
 return <section className={styles.panel} aria-labelledby={id}><h3 id={id}>Actividad de las cuentas</h3><div className={styles.anilloContenido}>{total>0&&<svg className={styles.anillo} viewBox="0 0 120 120" role="img" aria-labelledby={id+'-titulo'}><title id={id+'-titulo'}>{`${activas} cuentas activas de ${total}. ${total-activas} inactivas.`}</title><circle className={styles.anilloBase} cx="60" cy="60" r="44"/><circle className={styles.anilloValor} cx="60" cy="60" r="44" pathLength="100" strokeDasharray={`${fraccion*100} 100`} transform="rotate(-90 60 60)"/><text x="60" y="65" textAnchor="middle">{numero(total)}</text></svg>}<ul className={styles.lista}>{datos.map(d=><li key={d.etiqueta}><span>{d.etiqueta}</span><strong>{numero(d.total)} ({porcentaje(d.total,total)} %)</strong></li>)}</ul></div>{total===0&&<p className={admin.vacio}>Sin cuentas visibles.</p>}</section>;
}

export function GraficosDashboard({estadisticas,rol}:{estadisticas:EstadisticasDashboard;rol:string}) {
 return <section aria-label="Estadísticas del dashboard">{rol==='Administrador'?<p className={styles.periodo}>Cuentas y oficinas visibles · Actualizado {fecha(estadisticas.actualizado)} · America/Lima.</p>:<p className={styles.periodo}><strong>Periodo de la serie mensual:</strong> {fecha(estadisticas.periodo.desde)} – {fecha(estadisticas.periodo.hasta)} · America/Lima · Mes actual parcial. Las distribuciones por situación y tipo abarcan todo el historial visible.</p>}
 {rol==='Secretaria de Dirección'&&<p className={styles.periodo}>Los gráficos siguientes corresponden únicamente al ámbito compartido. El resumen y los recientes conservan el conjunto de documentos consultables por tu perfil.</p>}
 {'grupos_documentales' in estadisticas&&rol!=='Administrador'&&estadisticas.grupos_documentales.map(grupo=>grupo.clave==='personales_ajenos'?<details className={styles.grupoLectura} key={grupo.clave}><summary>Consultar estadísticas de ámbitos personales ajenos · {numero(grupo.total)} documentos · solo lectura</summary><Documental grupo={grupo}/></details>:<Documental key={grupo.clave} grupo={grupo}/>)}
 {estadisticas.administracion&&<section className={admin.tarjeta}><h2>Administración de cuentas y oficinas</h2><p className={styles.ayuda}>{rol==='Administrador'?'Incluye únicamente cuentas que puedes administrar. Superadministración está excluida de todos los conteos.':'Vista global de cuentas y oficinas autorizadas.'}</p><div className={styles.grid}><Barras datos={estadisticas.administracion.cuentas_por_rol} total={estadisticas.administracion.cuentas_por_rol.reduce((n,r)=>n+r.total,0)} titulo="Cuentas por rol" descripcion="¿Cómo se distribuyen las cuentas visibles? Incluye activas e inactivas."/><ActividadCuentas datos={estadisticas.administracion.actividad_cuentas}/></div><h3 className={styles.tituloOficinas}>Actividad de las oficinas</h3><ul className={styles.oficinas}>{estadisticas.administracion.actividad_oficinas.map(d=><li key={d.etiqueta}><span>{d.etiqueta}</span><strong>{numero(d.total)}</strong></li>)}</ul></section>}
 </section>;
}
