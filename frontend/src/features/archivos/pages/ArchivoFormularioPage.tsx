import { useCallback, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { useCatalogosArchivos } from '../hooks/useCatalogosArchivos';
import { CabeceraArchivos } from '../components/CabeceraArchivos';
import { ArchivoForm } from '../components/ArchivoForm';
import type { Crear, Metadatos } from '../schemas/archivos.schema';
import * as api from '../api/archivos.api';
import base from '../../../components/ui/Admin.module.css';
import styles from '../styles/Archivos.module.css';
/** No desmonta el formulario tras un fallo de escritura ni repite una solicitud pendiente. */
export function ArchivoFormularioPage() {
    const { id } = useParams();
    const token = useAuth().sesion!.token;
    const navigate = useNavigate();
    const catalogos = useCatalogosArchivos();
    const consulta = useConsulta(useCallback(() => id ? api.detalle(token, id) : Promise.resolve(null), [token, id]));
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState('');
    const enviando = useRef(false);
    /** La preconsulta reduce sobrescrituras; el contrato actual no dispone de CAS/ETag atómico. */
    async function guardar(datos: Crear | Metadatos) {
        if (enviando.current) return;
        enviando.current = true; setOcupado(true); setError('');
        try {
            if (id && consulta.datos) {
                const actual = (await api.detalle(token, id)).archivo;
                const previo = consulta.datos.archivo;
                if (actual.nombre !== previo.nombre || actual.responsabilidad !== previo.responsabilidad || actual.motivo !== previo.motivo)
                    throw new Error('El archivo cambió mientras lo editabas. Tus datos no se enviaron. Consulta sus datos actuales y vuelve a abrir la corrección.');
            }
            const respuesta = id ? await api.corregir(token, id, datos) : await api.crear(token, datos as Crear);
            navigate(`/archivos/${respuesta.archivo.id}`, { replace: true, state: { mensaje: id ? 'Corrección guardada con su motivo.' : 'Archivo y responsable inicial registrados correctamente.' } });
        } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el archivo.'); }
        finally { enviando.current = false; setOcupado(false); }
    }
    return <main className={`${base.pagina} ${styles.modulo}`}>
        <CabeceraArchivos titulo={id ? 'Corregir archivo institucional' : 'Crear archivo institucional'} descripcion="Administración de responsabilidades y conjuntos documentales institucionales." />
        <EstadoCarga cargando={consulta.cargando || catalogos.cargando} error={consulta.error || catalogos.error} reintentar={() => { consulta.recargar(); catalogos.recargar(); }} />
        {!consulta.cargando && !catalogos.cargando && !consulta.error && !catalogos.error && catalogos.datos && <section className={base.tarjeta}>
            {!id && <p className={styles.aviso}>El archivo conserva su identidad institucional aunque posteriormente cambie el trabajador responsable.</p>}
            <ArchivoForm key={id ?? 'nuevo'} inicial={consulta.datos?.archivo} {...catalogos.datos} ocupado={ocupado} error={error} guardar={guardar} />
        </section>}
    </main>;
}
