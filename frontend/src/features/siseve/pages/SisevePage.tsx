import { clientePdf,subirPdf,comprobarSeleccion } from '../../documentos/api/pdf.api';
import siseveStyles from '../styles/Siseve.module.css';
import { useState } from 'react';
import { useAuth } from '../../auth/hooks/useAuth';
import { useAccesoSiseve } from '../hooks/useAccesoSiseve';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { SiseveOperacionForm, type Preparacion } from '../components/SiseveOperacionForm';
import { SiseveResultado } from '../components/SiseveResultado';
import * as api from '../api/siseve.api';
import type { Solicitud } from '../schemas/siseve.schema';
import styles from '../../../components/ui/Admin.module.css';
/** Coordina operaciones independientes: conserva resultados, nunca la clave ni una sesión de desbloqueo. */
export function SisevePage() {
    const sesion = useAuth().sesion!;
    const acceso = useAccesoSiseve();
    const [resultado, setResultado] = useState<api.Resultado | null>(null);
    const [catalogos, setCatalogos] = useState<Extract<api.Resultado, {
        tipos: unknown;
    }> | null>(null);
    const [documento, setDocumento] = useState<Extract<api.Resultado, {
        documento: unknown;
    }> | null>(null);
    const [movimiento, setMovimiento] = useState<Extract<api.Resultado, {
        movimiento: unknown;
    }> | null>(null);
    const [preparacion, setPreparacion] = useState<Preparacion>({ operacion: 'listar', id: '', revision: 0 });
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState('');
    /**
     * Prepara los campos de la siguiente operación e incrementa la revisión para reiniciar el formulario; no transmite ni conserva la clave.
     * @param p - Campos de preparación de la siguiente operación.
     */
    const preparar = (p: Omit<Preparacion, 'revision'>) => setPreparacion(/** Incrementa la revisión de preparación para reiniciar los campos sin conservar claves. */  anterior => ({ ...p, revision: anterior.revision + 1 }));
    const operaciones = [{ id: 'listar', nombre: 'Buscar y listar documentos' }, { id: 'opciones', nombre: 'Consultar opciones para registro o derivación' }, { id: 'detalle', nombre: 'Consultar un documento' }, { id: 'historial', nombre: 'Consultar historial de un documento' }, { id: 'movimientos', nombre: 'Consultar recorrido documental' }, { id: 'movimiento', nombre: 'Consultar un movimiento' }, ...(acceso.datos?.puede_registrar ? [{ id: 'registrar', nombre: 'Registrar documento físico SíseVe' }] : [])];
    if (documento) {
        const d = documento.documento;
        for (const [permiso, permitido] of Object.entries(d.permisos))
            if (permitido) {
                const id = permiso === 'editar' ? 'corregir' : permiso === 'solicitar_decision' ? 'solicitar-decision' : permiso;
                operaciones.push({ id, nombre: `${id} · documento ${d.codigo}` });
            }
        if (d.permisos.autorizar && d.destinatario_autorizado_id)
            operaciones.push({ id: 'retirar-autorizacion', nombre: 'Retirar autorización antes de salida' });
    }
    if (movimiento) {
        const m = movimiento.movimiento;
        if (m.estado === 'EN_TRASLADO' && m.usuario_destino_id === sesion.usuario.id)
            operaciones.push({ id: 'recibir', nombre: 'Confirmar recepción física' }, { id: 'rechazar', nombre: 'Rechazar recepción' });
        if (m.estado === 'EN_TRASLADO' && m.usuario_origen_id === sesion.usuario.id)
            operaciones.push({ id: 'cancelar', nombre: 'Cancelar traslado con original recuperado' });
        if (m.estado === 'RECHAZADO' && !m.devolucion_confirmada_por_id && m.usuario_origen_id === sesion.usuario.id)
            operaciones.push({ id: 'recuperar', nombre: 'Confirmar recuperación física en origen' });
    }
    /**
     * Envía una operación con su clave adicional y conserva únicamente resultados autorizados; ante un fallo descarta datos y preparación anteriores.
     * @param d - Datos tipados del registro o formulario de esta operación.
     */
    async function ejecutar(d: Solicitud,pdf?:File|null) {
        setError('');
        setResultado(null);
        setOcupado(true);
        try {
            if(pdf)comprobarSeleccion(pdf);
            const r = await api.ejecutarSolicitud(sesion.token, d, acceso.datos!.tipo_documental_id, documento?.documento.id === d.id ? documento.documento.destinatario_autorizado_id : null);
            if(pdf&&d.operacion==='registrar'&&'documento' in r){
                try { await subirPdf(clientePdf(sesion.token,r.documento.id,()=>d.clave),pdf,null); }
                catch(e){setError(`Documento registrado. PDF no confirmado: ${e instanceof Error?e.message:'Reintente desde el detalle'}`);}
            }
            setResultado(r);
            if ('tipos' in r)
                setCatalogos(r);
            if ('documento' in r) {
                setDocumento(r);
                setMovimiento(null);
            }
            if ('movimiento' in r) {
                setMovimiento(r);
                setDocumento(null);
            }
        }
        catch (e) {
            setResultado(null);
            setCatalogos(null);
            setDocumento(null);
            setMovimiento(null);
            setPreparacion(/** Restablece la preparación después de un fallo y descarta la operación anterior. */  p => ({ operacion: 'listar', id: '', revision: p.revision + 1 }));
            setError(e instanceof Error ? e.message : 'No se pudo autorizar la operación');
        }
        finally {
            setOcupado(false);
        }
    }
    return <main className={`${styles.pagina} ${siseveStyles.modulo}`}>
        <h1>SíseVe · documentación restringida</h1>
        <p className={siseveStyles.aviso}>Se requieren autorización individual vigente y contraseña adicional en cada operación. El acceso no amplía los permisos de custodia o circulación.</p>
        <EstadoCarga {...acceso} reintentar={acceso.recargar} />
        {error && <p className={styles.error} role="alert">
            {error}
        </p>}
        {acceso.datos && (acceso.datos.autorizado ? <>
            <SiseveOperacionForm key={preparacion.revision} preparacion={preparacion} operaciones={operaciones} catalogos={catalogos} destinoAutorizado={documento?.documento.id === preparacion.id ? documento.documento.destinatario_autorizado_id : null} ocupado={ocupado} ejecutar={ejecutar} />
            {resultado && <SiseveResultado token={sesion.token} resultado={resultado} preparar={preparar} acciones={operaciones.filter(/** Selecciona acciones documentales o físicas para el resultado, excluyendo las consultas generales. */  o => !['listar', 'opciones', 'detalle', 'historial', 'movimientos', 'movimiento', 'registrar'].includes(o.id))} />}
        </> : <section className={styles.tarjeta}>
            <h2>Acceso no autorizado</h2>
            <p>Su cuenta no tiene una autorización individual activa. Conocer la contraseña compartida no sustituye este permiso.</p>
        </section>)}
    </main>;
}
