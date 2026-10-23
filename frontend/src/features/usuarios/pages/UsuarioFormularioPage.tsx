import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { useConsulta } from '../../../hooks/useConsulta';
import { useCatalogosUsuarios } from '../hooks/useCatalogosUsuarios';
import * as api from '../api/usuarios.api';
import { UsuarioForm } from '../components/UsuarioForm';
import type { CrearUsuario, DatosUsuario } from '../schemas/usuarios.schema';
import { EstadoCarga } from '../../../components/ui/EstadoCarga';
import { Confirmacion } from '../../../components/ui/Confirmacion';
import styles from '../../../components/ui/Admin.module.css';
/** Coordina catálogos reales y escritura; exige confirmación antes de cambiar el rol propio. */
export function UsuarioFormularioPage() {
    const { id } = useParams();
    const auth = useAuth();
    const token = auth.sesion!.token;
    const navigate = useNavigate();
    const consulta = useCallback(/** Consulta la cuenta al editar; evita una petición de detalle en creación. */() => id ? api.detalle(token, id) : Promise.resolve(null), [id, token]);
    const usuario = useConsulta(consulta);
    const catalogos = useCatalogosUsuarios();
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState('');
    const [confirmar, setConfirmar] = useState<DatosUsuario | null>(null);
    /**
     * Crea o edita la cuenta con el contrato correspondiente; vuelve a verificar la sesión propia y navega al detalle si la operación lo permite.
     * @param datos - Datos de entrada según el contrato tipado de esta operación.
     */
    async function guardar(datos: DatosUsuario | CrearUsuario) {
        if (ocupado)
            return;
        setOcupado(true);
        setError('');
        try {
            const respuesta = id ? await api.editar(token, id, datos) : await api.crear(token, datos as CrearUsuario);
            if (id === auth.sesion?.usuario.id)
                await auth.recuperar();
            navigate(id === auth.sesion?.usuario.id && respuesta.usuario.rol !== 'Administrador' ? '/dashboard' : `/usuarios/${respuesta.usuario.id}`, { replace: true, state: { mensaje: 'Cuenta guardada correctamente.' } });
        }
        catch (fallo) {
            setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar la cuenta.');
        }
        finally {
            setOcupado(false);
            setConfirmar(null);
        }
    }
    return <main className={styles.pagina}>
        <div className={styles.titulo}>
            <div>
                <h1>
                    {id ? 'Editar cuenta' : 'Crear cuenta'}
                </h1>
                <p>Datos personales y asignación institucional.</p>
            </div>
        </div>
        <EstadoCarga cargando={usuario.cargando || catalogos.cargando} error={usuario.error || catalogos.error} reintentar={/** Reintenta tanto la cuenta como los catálogos de asignación. */() => {
            usuario.recargar();
            catalogos.recargar();
        }} />
        {!usuario.cargando && !catalogos.cargando && !usuario.error && !catalogos.error && catalogos.datos &&
            <section className={styles.tarjeta}>
                <UsuarioForm inicial={usuario.datos?.usuario} roles={catalogos.datos.roles} oficinas={catalogos.datos.oficinas} ocupado={ocupado} error={error} onGuardar={/** Solicita confirmación si se cambia el rol propio; en otros casos guarda directamente los datos validados. */async (datos) => {
                    if (id === auth.sesion?.usuario.id && usuario.datos?.usuario.rol_id !== datos.rol_id)
                        setConfirmar(datos);
                    else
                        await guardar(datos);
                }} />
            </section>}
        {confirmar && <Confirmacion titulo="Cambiar tu propio rol" ocupado={ocupado} cancelar={/** Descarta la edición pendiente que requería confirmación. */() => setConfirmar(null)} confirmar={/** Guarda los datos del cambio de rol propio ya confirmado. */() => {
            void guardar(confirmar);
        }}>
            <p>Se actualizarán tus permisos. Si dejas de ser Administrador, ya no podrás acceder a estos módulos.</p>
        </Confirmacion>}
    </main>;
}
