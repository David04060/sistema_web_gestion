import {useCallback} from 'react';
import {Link} from 'react-router-dom';
import {api,etiquetas} from '../../../api/documental';
import {rolesRegistro,esAdministracion} from '../../../lib/perfiles';
import {useAuth} from '../../auth/hooks/useAuth';
import type {Usuario} from '../../auth/schemas/auth.schema';
import {useConsulta} from '../../../hooks/useConsulta';
import {EstadoCarga} from '../../../components/ui/EstadoCarga';
import {TextoExpandible} from '../../../components/ui/TextoExpandible';
import {GraficosDashboard} from '../components/GraficosDashboard';
import {fechaLocal} from '../../../lib/fechas';
import styles from '../../../components/ui/Admin.module.css';

export function DashboardPage(_props:{usuario?:Usuario}={}){
 const {token,usuario}=useAuth().sesion!;
 const consulta=useConsulta(useCallback(()=>api.dashboard(token),[token]));
 const datos=consulta.datos,admin=esAdministracion(usuario.rol);
 const estados=datos?('estados' in datos?datos.estados:'documentos' in datos?datos.documentos??[]:[]):[];
 return <main className={styles.pagina}>
 <header className={styles.titulo}><div><h1>Tu espacio de trabajo</h1><p>Hola, {usuario.nombre}. Este es tu panel de {usuario.rol}.</p></div>
 {rolesRegistro.includes(usuario.rol)&&<Link className={styles.boton} to="/documentos/nuevo">Registrar documento</Link>}</header>
 <EstadoCarga {...consulta} reintentar={consulta.recargar}/>
 {datos&&<>
 {'usuarios' in datos&&<section className={styles.indicadores} aria-label="Resumen administrativo"><article className={styles.indicador}><span>Cuentas visibles</span><strong>{datos.usuarios}</strong><Link to="/usuarios">Administrar usuarios</Link></article><article className={styles.indicador}><span>Oficinas registradas</span><strong>{datos.oficinas}</strong><Link to="/oficinas">Administrar oficinas</Link></article></section>}
 {('estados' in datos||'documentos' in datos)&&<section className={styles.tarjeta}><h2>Resumen documental</h2><p>{usuario.rol==='Usuario'?'Registros de tu ámbito personal.':'Documentos que puedes consultar según tu perfil.'}</p>{estados.length?<div className={styles.indicadores}>{estados.map(s=><Link className={styles.indicador} key={s.situacion} to={'/documentos?situacion='+s.situacion}><span>{etiquetas[s.situacion]}</span><strong>{s.total}</strong><span>Consultar registros →</span></Link>)}</div>:<p className={styles.vacio}>Todavía no hay documentos visibles.</p>}</section>}
 <section className={styles.tarjeta}><h2>Accesos rápidos</h2><div className={styles.acciones}>
 {usuario.rol!=='Administrador'&&<Link className={styles.secundario} to="/documentos">Consultar documentos</Link>}
 {usuario.rol==='Superadministrador'&&<Link className={styles.secundario} to="/documentos?situacion=ANULADO">Consultar anulados</Link>}
 {admin&&<><Link className={styles.secundario} to="/usuarios">Usuarios y asignaciones</Link><Link className={styles.secundario} to="/oficinas">Editar oficinas</Link><Link className={styles.secundario} to="/campos-opcionales">Campos opcionales</Link></>}
 {rolesRegistro.includes(usuario.rol)&&<Link className={styles.secundario} to="/tipos-documentales">Mis tipos documentales</Link>}
 {(admin||usuario.oficina_id)&&<Link className={styles.secundario} to="/ubicaciones">{admin?'Ubicaciones por cuenta':'Mis ubicaciones'}</Link>}
 </div></section>
 {datos.estadisticas&&<GraficosDashboard estadisticas={datos.estadisticas} rol={usuario.rol}/>}
 {'recientes' in datos&&<section className={styles.tarjeta}><h2>Documentos recientes</h2>{datos.recientes.length?<ul className={styles.recientes}>{datos.recientes.map(d=><li key={d.id}><div><Link to={'/documentos/'+d.id}>{d.codigo_visible}</Link><TextoExpandible texto={d.asunto}/></div><span>{etiquetas[d.situacion]} · {fechaLocal(d.creado_en)}</span></li>)}</ul>:<p className={styles.vacio}>Aún no hay registros recientes.</p>}</section>}
 </>}
 </main>;
}
