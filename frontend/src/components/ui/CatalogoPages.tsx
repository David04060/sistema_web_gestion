import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useAuth } from '../../features/auth/hooks/useAuth';
import { useConsulta } from '../../hooks/useConsulta';
import { fechaLocal } from '../../lib/fechas';
import type { RegistroCatalogo, detalleCatalogoSchema } from '../../lib/catalogo.schema';
import { EstadoCarga } from './EstadoCarga';
import styles from './Admin.module.css';
export interface CatalogoApi {
    listar: (token: string) => Promise<RegistroCatalogo[]>;
    detalle: (token: string, id: string) => Promise<z.infer<typeof detalleCatalogoSchema>>;
    guardar: (token: string, nombre: string, id?: string) => Promise<{
        registro: RegistroCatalogo;
    }>;
}
export interface CatalogoProps {
    titulo: string;
    singular: string;
    ruta: string;
    api: CatalogoApi;
    schema: z.ZodType<{
        nombre: string;
    }>;
}
/** Tabla compartida por catálogos con el mismo contrato; los datos siempre proceden del API del módulo. */
export function CatalogoLista({ titulo, singular, ruta, api }: CatalogoProps) {
    const token = useAuth().sesion!.token;
    const consulta = useCallback(/** Consulta el catálogo configurado con el JWT actual. */() => api.listar(token), [api, token]);
    const { datos, cargando, error, recargar } = useConsulta(consulta);
    return <main className={styles.pagina}>
        <div className={styles.titulo}>
            <div>
                <h1>
                    {titulo}
                </h1>
                <p>Catálogo institucional y asociación con cuentas.</p>
            </div>
            <Link className={styles.boton} to={`${ruta}/nuevo`}>Registrar {singular.toLowerCase()}
            </Link>
        </div>
        <section className={styles.tarjeta}>
            <EstadoCarga cargando={cargando} error={error} reintentar={recargar} />
            {datos && (datos.length ? <div className={styles.tabla}>
                <table>
                    <caption className="sr-only">
                        {titulo} registrados</caption>
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>Usuarios asociados</th>
                            <th>Condición</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {datos.map(/** Presenta una fila del catálogo y ofrece edición solo para denominaciones no reservadas. */  registro => <tr key={registro.id}>
                            <td>
                                <Link to={`${ruta}/${registro.id}`}>
                                    {registro.nombre}
                                </Link>
                            </td>
                            <td>
                                {registro.usuarios_asociados}
                            </td>
                            <td>
                                {registro.reservado ? 'Institucional reservado' : 'Editable'}
                            </td>
                            <td>
                                <div className={styles.acciones}>
                                    <Link to={`${ruta}/${registro.id}`}>Consultar</Link>
                                    {!registro.reservado && <Link to={`${ruta}/${registro.id}/editar`}>Editar</Link>}
                                </div>
                            </td>
                        </tr>)}
                    </tbody>
                </table>
            </div> : <p className={styles.vacio}>No hay registros en este catálogo.</p>)}
        </section>
    </main>;
}
/**
 * Consulta un registro del catálogo y sus cuentas asociadas; ofrece edición únicamente si la denominación no está reservada.
 * @param props - Propiedades tipadas del componente, con datos y callbacks de su pantalla.
 */
export function CatalogoDetalle({ singular, ruta, api }: CatalogoProps) {
    const { id = '' } = useParams();
    const token = useAuth().sesion!.token;
    const consulta = useCallback(/** Consulta el detalle del catálogo seleccionado en la ruta. */() => api.detalle(token, id), [api, token, id]);
    const { datos, cargando, error, recargar } = useConsulta(consulta);
    const location = useLocation();
    const mensaje = location.state && typeof location.state.mensaje === 'string' ? location.state.mensaje : '';
    return <main className={styles.pagina}>
        <div className={styles.titulo}>
            <div>
                <h1>Información de {singular.toLowerCase()}
                </h1>
            </div>
            <Link className={styles.secundario} to={ruta}>Volver al listado</Link>
        </div>
        {mensaje && <p className={styles.exito} role="status">
            {mensaje}
        </p>}
        <EstadoCarga cargando={cargando} error={error} reintentar={recargar} />
        {datos && <>
            <section className={styles.tarjeta}>
                <h2>
                    {datos.registro.nombre}
                </h2>
                {datos.registro.reservado && <p className={styles.aviso}>Denominación institucional reservada. No se permite modificar su nombre.</p>}
                <dl className={styles.datos}>
                    <div>
                        <dt>Fecha de registro</dt>
                        <dd>
                            {fechaLocal(datos.registro.fecha_creacion)}
                        </dd>
                    </div>
                    <div>
                        <dt>Última modificación</dt>
                        <dd>
                            {fechaLocal(datos.registro.fecha_modificacion)}
                        </dd>
                    </div>
                    <div>
                        <dt>Usuarios asociados</dt>
                        <dd>
                            {datos.registro.usuarios_asociados}
                        </dd>
                    </div>
                </dl>
                {!datos.registro.reservado && <Link className={styles.boton} to={`${ruta}/${id}/editar`}>Editar nombre</Link>}
            </section>
            <section className={styles.tarjeta}>
                <h2>Cuentas asociadas</h2>
                {datos.usuarios.length ? <div className={styles.tabla}>
                    <table>
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Usuario</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {datos.usuarios.map(/** Presenta una cuenta asociada sin campos privados de autenticación. */  usuario => <tr key={usuario.id}>
                                <td>
                                    <Link to={`/usuarios/${usuario.id}`}>
                                        {usuario.nombre} {usuario.apellido}
                                    </Link>
                                </td>
                                <td>
                                    {usuario.nombre_usuario}
                                </td>
                                <td>
                                    {usuario.activo ? 'Activo' : 'Inactivo'}
                                </td>
                            </tr>)}
                        </tbody>
                    </table>
                </div> : <p className={styles.vacio}>No hay cuentas asociadas.</p>}
            </section>
        </>}
    </main>;
}
/** React Hook Form mantiene estado; el esquema del módulo valida antes de enviar y Express revalida. */
export function CatalogoFormulario({ singular, ruta, api, schema }: CatalogoProps) {
    const { id } = useParams();
    const token = useAuth().sesion!.token;
    const navigate = useNavigate();
    const [guardando, setGuardando] = useState(false);
    const [errorGuardar, setErrorGuardar] = useState('');
    const consulta = useCallback(/** Consulta el registro al editar; en creación devuelve null sin realizar una petición de detalle. */() => id ? api.detalle(token, id) : Promise.resolve(null), [api, token, id]);
    const { datos, cargando, error, recargar } = useConsulta(consulta);
    const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<{
        nombre: string;
    }>({ defaultValues: { nombre: '' } });
    useEffect(/** Sincroniza el nombre del formulario cuando llega el registro consultado. */() => {
        if (datos)
            reset({ nombre: datos.registro.nombre });
    }, [datos, reset]);
    /**
     * Valida el nombre con el esquema del módulo, evita envíos simultáneos y navega al detalle confirmado; presenta el error sin perder el formulario.
     * @param valores - Campos del formulario antes de normalizar y validar.
     */
    async function guardar(valores: {
        nombre: string;
    }) {
        if (guardando)
            return;
        const resultado = schema.safeParse(valores);
        if (!resultado.success) {
            setError('nombre', { message: resultado.error.issues[0]?.message ?? 'Nombre inválido' });
            return;
        }
        setGuardando(true);
        setErrorGuardar('');
        try {
            const respuesta = await api.guardar(token, resultado.data.nombre, id);
            navigate(`${ruta}/${respuesta.registro.id}`, { replace: true, state: { mensaje: `${singular} ${id ? 'actualizado' : 'registrado'} correctamente.` } });
        }
        catch (fallo) {
            setErrorGuardar(fallo instanceof Error ? fallo.message : 'No se pudo guardar el registro.');
        }
        finally {
            setGuardando(false);
        }
    }
    return <main className={styles.pagina}>
        <div className={styles.titulo}>
            <div>
                <h1>
                    {id ? 'Editar' : 'Registrar'} {singular.toLowerCase()}
                </h1>
                <p>Utiliza la denominación institucional correspondiente.</p>
            </div>
        </div>
        <EstadoCarga cargando={cargando} error={error} reintentar={recargar} />
        {!cargando && !error && <section className={styles.tarjeta}>
            {datos?.registro.reservado ? <p className={styles.aviso}>Esta denominación está reservada y no puede editarse.</p> :
                <form onSubmit={handleSubmit(guardar)} noValidate aria-busy={guardando}>
                    <div className={styles.campo}>
                        <label htmlFor="catalogo-nombre">Nombre</label>
                        <input id="catalogo-nombre" {...register('nombre')} disabled={guardando} aria-invalid={!!errors.nombre} aria-describedby={errors.nombre ? "catalogo-error" : undefined} required />
                        {errors.nombre && <p id="catalogo-error" className={styles.error} role="alert">
                            {errors.nombre.message}
                        </p>}
                    </div>
                    {errorGuardar && <p className={styles.error} role="alert">
                        {errorGuardar}
                    </p>}
                    <div className={styles.acciones}>
                        <button className={styles.boton} disabled={guardando}>
                            {guardando ? 'Guardando…' : 'Guardar'}
                        </button>
                        {!guardando && <Link className={styles.secundario} to={id ? `${ruta}/${id}` : ruta}>Cancelar</Link>}
                    </div>
                </form>}
        </section>}
    </main>;
}
