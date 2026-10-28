import {DelegacionPersonalCampos,destinoPersonalVacio,construirDestinoPersonal} from './DelegacionPersonalCampos';
import {DecisionDireccionCampos,decisionVacia,construirDecision,type DecisionDireccion} from './DecisionDireccionCampos';
import documentoStyles from '../styles/Documentos.module.css';
import { Link } from 'react-router-dom';
import { useCallback, useState } from 'react';
import { useConsulta } from '../../../hooks/useConsulta';
import * as api from '../api/documentos.api';
import type { z } from 'zod';
import type { detalleDocumentoSchema } from '../schemas/documentos.schema';
import { fechaLocal } from '../../../lib/fechas';
import styles from '../../../components/ui/Admin.module.css';

export const situacionesEntrega = {
    PENDIENTE_DECISION: 'Pendiente de decisión',
    DELEGADO: 'Delegado',
    ENTREGADO: 'Entregado',
    GUARDADO_DIRECCION: 'Guardado en Dirección',
    GUARDADO_SECRETARIA: 'Guardado en Secretaría',
};

/** Decisión de Dirección y confirmación por Secretaría; el backend revalida ambas. */
export function EntregaSecretaria({ documento: d, token, actualizar }: {
    documento: z.infer<typeof detalleDocumentoSchema>['documento'];
    token: string;
    actualizar: (mensaje: string) => void;
}) {
    const opciones = useConsulta(useCallback(() => api.opciones(token), [token]));
    const [decision,setDecision]=useState<DecisionDireccion>({...decisionVacia,accion:'DELEGAR'});
    const [personal,setPersonal]=useState(destinoPersonalVacio);
    const [motivo, setMotivo] = useState('');
    const [error, setError] = useState('');
    const [ocupado, setOcupado] = useState(false);
    if (!d.entrega && !d.registro_personal) return null;
    const entrega = d.entrega??{situacion:'PENDIENTE_DECISION' as const,destinatario:null,observaciones:null,ubicacion_direccion:null,asignado_en:null,asignado_por:null,confirmado_en:null,confirmado_por:null,revision:0};

    async function ejecutar(operacion: 'delegar' | 'guardar-direccion' | 'confirmar-entrega') {
        setOcupado(true);
        setError('');
        try {
            const inicial=operacion==='confirmar-entrega'?undefined:construirDecision(decision);
            const {accion: _accion,...campos}=inicial??{};
            void _accion;
            const datos={...campos,revision:entrega.revision};
            await api.operar(token, d.id, operacion, datos);
            actualizar(operacion === 'delegar' ? 'Delegado' : operacion === 'guardar-direccion' ? (opciones.datos?.nombre_guardado??'Guardado en Dirección').replace('Guardar','Guardado') : 'Entregado');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo guardar');
        } finally {
            setOcupado(false);
        }
    }

    return <section className={`${styles.tarjeta} ${documentoStyles.panelAcciones}`}>
        <h2>{d.registro_personal&&!d.entrega?'Sin delegación':situacionesEntrega[entrega.situacion]}</h2>
        {d.permisos.delegar_personal&&<form className={documentoStyles.formularioAccion} onSubmit={e=>{e.preventDefault();setError('');setOcupado(true);void Promise.resolve().then(()=>api.operar(token,d.id,'delegar-personal',construirDestinoPersonal(personal))).then(()=>actualizar('Delegado')).catch(e=>setError(e instanceof Error?e.message:'No se pudo delegar')).finally(()=>setOcupado(false));}}>
         <DelegacionPersonalCampos valor={personal} onChange={setPersonal} opciones={opciones.datos}/>
         <button className={styles.boton} disabled={ocupado||opciones.cargando||!!opciones.error}>Registrar delegación</button>
        </form>}
        {entrega.destinatario && <p>Destinatario: {entrega.destinatario}</p>}
        {entrega.observaciones && <p>Observaciones de delegación: {entrega.observaciones}</p>}
        {entrega.ubicacion_direccion && <p>Ubicación: {entrega.ubicacion_direccion}</p>}
        {entrega.asignado_en && <p>{entrega.ubicacion_direccion ? 'Guardado por' : 'Delegado por'}: {entrega.asignado_por} · {fechaLocal(entrega.asignado_en)}</p>}
        {entrega.confirmado_en && <p>Entrega confirmada por: {entrega.confirmado_por} · {fechaLocal(entrega.confirmado_en)}</p>}
        {d.permisos.asignar_destinatario && <form className={documentoStyles.formularioAccion} onSubmit={e=>{e.preventDefault();void ejecutar(decision.accion==='DELEGAR'?'delegar':'guardar-direccion');}}>
            {opciones.error&&<p role="alert">{opciones.error}</p>}
            <DecisionDireccionCampos valor={decision} onChange={setDecision} opciones={opciones.datos}/>
            <button className={styles.boton} disabled={ocupado||opciones.cargando||!!opciones.error}>{decision.accion==='DELEGAR'?'Delegar':'Guardar ubicación'}</button>
        </form>}
        {d.permisos.confirmar_entrega && <button className={styles.boton} disabled={ocupado} onClick={() => void ejecutar('confirmar-entrega')}>Confirmar entrega</button>}
        {d.permisos.editar && <div className={documentoStyles.edicion}><Link className={styles.secundario} to={`/documentos/${d.id}/editar`}>Corregir datos</Link></div>}
        {d.permisos.anular && <details className={documentoStyles.anulacion}><summary>Anular registro</summary>
            <form onSubmit={e => {
                e.preventDefault(); setOcupado(true);
                void api.operar(token, d.id, 'anular', { motivo }).then(() => actualizar('Registro anulado')).catch(e => setError(e instanceof Error ? e.message : 'No se pudo anular')).finally(() => setOcupado(false));
            }}>
                <div className={styles.campo}><label htmlFor="motivo-anulacion">Motivo de anulación</label>
                <textarea id="motivo-anulacion" required maxLength={1000} value={motivo} onChange={e => setMotivo(e.target.value)} /></div>
                <button className={styles.peligro} disabled={ocupado}>Anular registro</button>
            </form>
        </details>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
    </section>;
}
