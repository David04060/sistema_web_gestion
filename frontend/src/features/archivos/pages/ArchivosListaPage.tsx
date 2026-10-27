import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { useCatalogosArchivos, responsableCompatible } from '../hooks/useCatalogosArchivos';
import type { RegistroCatalogo } from '../../../lib/catalogo.schema';
import type { UsuarioAdministrado } from '../../usuarios/schemas/usuarios.schema';
import { CabeceraArchivos } from '../components/CabeceraArchivos';
import { PaginacionArchivos } from '../components/PaginacionArchivos';
import * as api from '../api/archivos.api';
import base from '../../../components/ui/Admin.module.css';
import styles from '../styles/Archivos.module.css';
/** La selección de oficina también acota y limpia el responsable del filtro. */
function FiltrosArchivos({ params, oficinas, usuarios, buscar }: {
    params: URLSearchParams; oficinas: RegistroCatalogo[]; usuarios: UsuarioAdministrado[]; buscar: (p: URLSearchParams) => void;
}) {
    const [oficinaId, setOficina] = useState(params.get('oficina_id') ?? '');
    const [responsableId, setResponsable] = useState(params.get('responsable_id') ?? '');
    const disponibles = usuarios.filter(u => responsableCompatible(u, oficinas.find(o => o.id === (oficinaId || u.oficina_id))));
    const incompatible = !!responsableId && !disponibles.some(u => u.id === responsableId);
    useEffect(() => { if (incompatible) setResponsable(''); }, [incompatible]);
    return <form onSubmit={e => { e.preventDefault(); const p = new URLSearchParams(); for (const [k, v] of new FormData(e.currentTarget)) if (String(v).trim()) p.set(k, String(v).trim()); buscar(p); }}>
        <div className={styles.rejilla}>
            <div className={`${base.campo} ${styles.amplio}`}><label htmlFor="buscar-archivo">Buscar por nombre o responsabilidad</label><input id="buscar-archivo" name="q" maxLength={250} defaultValue={params.get('q') ?? ''} /></div>
            <div className={base.campo}><label htmlFor="filtro-archivo-oficina">Oficina</label><select id="filtro-archivo-oficina" name="oficina_id" value={oficinaId} onChange={e => { setOficina(e.target.value); setResponsable(''); }}><option value="">Todas las oficinas</option>{oficinas.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select></div>
            <div className={base.campo}><label htmlFor="filtro-archivo-responsable">Responsable vigente</label><select id="filtro-archivo-responsable" name="responsable_id" value={responsableId} onChange={e => setResponsable(e.target.value)}><option value="">Todos los responsables</option>{disponibles.map(u => <option key={u.id} value={u.id}>{u.nombre} {u.apellido} · {u.oficina}</option>)}</select></div>
        </div><div className={base.acciones}><button className={base.boton}>Buscar</button><button type="button" className={base.secundario} onClick={() => buscar(new URLSearchParams())}>Limpiar filtros</button></div>
    </form>;
}
/** Consulta paginada real de metadatos, sin inventarios. */
export function ArchivosListaPage() {
    const token = useAuth().sesion!.token;
    const [params, setParams] = useSearchParams();
    const filtros = params.toString();
    const consulta = useConsulta(useCallback(() => api.listar(token, filtros), [token, filtros]));
    const catalogos = useCatalogosArchivos();
    return <main className={`${base.pagina} ${styles.modulo}`}>
        <CabeceraArchivos titulo="Archivos institucionales" descripcion="Conjuntos documentales de una responsabilidad institucional estable."><Link className={base.boton} to="/archivos/nuevo">Crear archivo institucional</Link></CabeceraArchivos>
        <section className={base.tarjeta} aria-label="Filtros de archivos"><EstadoCarga {...catalogos} reintentar={catalogos.recargar} />
            {catalogos.datos && <FiltrosArchivos key={filtros} params={params} {...catalogos.datos} buscar={setParams} />}
        </section><EstadoCarga {...consulta} reintentar={consulta.recargar} />
        {consulta.datos && <section className={base.tarjeta} aria-label="Resultados de archivos">
            {consulta.datos.archivos.length ? <div className={styles.tabla} role="region" aria-label="Tabla de archivos institucionales" tabIndex={0}><table><caption>Archivos institucionales registrados</caption><thead><tr><th scope="col">Archivo y responsabilidad</th><th scope="col">Oficina</th><th scope="col">Responsable vigente</th><th scope="col">Acción</th></tr></thead><tbody>
                {consulta.datos.archivos.map(a => <tr key={a.id}><td><strong>{a.nombre}</strong><p>{a.responsabilidad.length > 180 ? a.responsabilidad.slice(0, 180) + '…' : a.responsabilidad}</p></td><td>{a.oficina}</td><td>{a.responsable}</td><td className={styles.acciones}><Link to={`/archivos/${a.id}`} aria-label={`Consultar ${a.nombre}`}>Consultar</Link></td></tr>)}
            </tbody></table></div> : <p className={base.vacio}>No hay archivos institucionales que coincidan con los filtros.</p>}
            <PaginacionArchivos {...consulta.datos} nombre="archivos" cambiar={(pagina, limite) => { const p = new URLSearchParams(params); p.set('pagina', String(pagina)); p.set('limite', String(limite)); setParams(p); }} />
        </section>}
    </main>;
}
