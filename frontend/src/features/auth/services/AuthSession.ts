import { ApiError, suscribirNoAutorizado } from '../../../api/client';
import { iniciarSesion, obtenerMiUsuario } from '../api/auth.api';
import type { LoginInput, Usuario } from '../schemas/auth.schema';
import { almacenamientoSesion, obtenerVencimiento } from './sessionStorage';
interface Sesion {
    token: string;
    usuario: Usuario;
    venceEn: number;
}
export interface EstadoAuth {
    estado: 'verificando' | 'anonimo' | 'autenticado' | 'error';
    sesion: Sesion | null;
    cargando: boolean;
    error: string;
    mensaje: string;
}
interface Dependencias {
    api: {
        iniciarSesion: typeof iniciarSesion;
        obtenerMiUsuario: typeof obtenerMiUsuario;
    };
    storage: typeof almacenamientoSesion;
    ahora: () => number;
    programar: (accion: () => void, ms: number) => ReturnType<typeof setTimeout>;
    cancelar: typeof clearTimeout;
}
const inicial: EstadoAuth = { estado: 'verificando', sesion: null, cargando: false, error: '', mensaje: '' };
/**
 * Única autoridad de sesión del cliente. El servidor decide la validez; exp solo
 * acota su duración local. Las dependencias por defecto usan Fetch y sessionStorage
 * reales. Las pruebas pueden inyectarlas sin cambiar el comportamiento productivo.
 */
export class AuthSession {
    private estado: EstadoAuth = inicial;
    private listeners = new Set<() => void>();
    private operacion = 0;
    private temporizador?: ReturnType<typeof setTimeout>;
    private desuscribir?: () => void;
    private recuperacionEnCurso?: {
        version: number;
        promesa: Promise<void>;
    };
    private deps: Dependencias;
    /**
     * Configura los adaptadores de API, almacenamiento, reloj y temporizadores; las pruebas pueden sustituirlos sin cambiar las reglas de sesión.
     * @param deps - Adaptadores opcionales para API, almacenamiento, reloj y temporizadores.
     */
    constructor(deps: Partial<Dependencias> = {}) {
        this.deps = {
            api: { iniciarSesion, obtenerMiUsuario }, storage: almacenamientoSesion,
            ahora: Date.now,
            // Las funciones nativas de Window necesitan su contexto; no se invocan como métodos de deps.
            /**
             * Programa la comprobación de vencimiento mediante la función global para conservar el contexto nativo del navegador.
             * @param accion - Función que debe ejecutarse al vencer el temporizador.
             * @param ms - Demora en milisegundos hasta ejecutar la comprobación.
             */
            programar: (accion, ms) => setTimeout(accion, ms),
            /**
             * Cancela el temporizador mediante la función global para conservar el contexto nativo del navegador.
             * @param id - Identificador del temporizador nativo que deja de observarse.
             */
            cancelar: id => clearTimeout(id),
            ...deps,
        };
    }
    /** Instantánea estable para React; cambia únicamente al publicar una transición. */
    getSnapshot = (): EstadoAuth => this.estado;
    /** Registra un consumidor y devuelve la limpieza de su suscripción. */
    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return /** Retira el consumidor que ya no necesita observar el estado. */ () => {
            this.listeners.delete(listener);
        };
    };
    /**
     * Sustituye la instantánea de sesión y notifica a los consumidores de useSyncExternalStore.
     * @param estado - Nueva instantánea o estado que debe publicarse.
     */
    private publicar(estado: EstadoAuth): void {
        this.estado = estado;
        this.listeners.forEach(/** Avisa al consumidor después de sustituir la instantánea de sesión. */  listener => listener());
    }
    /** Inicia observación de 401 autenticados y valida el token de la pestaña. */
    iniciar(): void {
        this.desuscribir = suscribirNoAutorizado(/** Invalida únicamente la sesión cuyo JWT coincide con el rechazado por el servidor. */  token => {
            if (this.estado.sesion?.token === token)
                this.invalidar('Tu sesión dejó de ser válida. Inicia sesión nuevamente.');
        });
        void this.recuperar();
    }
    /** Cancela resultados pendientes y temporizadores; no elimina la sesión al desmontar React. */
    detener(): void {
        this.operacion++;
        this.desuscribir?.();
        if (this.temporizador)
            this.deps.cancelar(this.temporizador);
    }
    /**
     * Cancela el temporizador y elimina el JWT de la pestaña; devuelve un mensaje si el navegador impide limpiar el almacenamiento.
     */
    private limpiar(): string {
        if (this.temporizador)
            this.deps.cancelar(this.temporizador);
        try {
            this.deps.storage.eliminar();
            return '';
        }
        catch {
            return 'No se pudo limpiar el almacenamiento de la pestaña. Cierra esta pestaña para descartar sus datos.';
        }
    }
    /**
     * Incrementa la versión de operación para descartar respuestas anteriores y publica una sesión anónima después de limpiar el JWT.
     * @param mensaje - Mensaje público que acompaña la transición.
     */
    private invalidar(mensaje: string): void {
        this.operacion++;
        const error = this.limpiar();
        this.publicar({ estado: 'anonimo', sesion: null, cargando: false, error, mensaje });
    }
    /** Descarta el estado y el JWT de esta pestaña; no representa revocación del servidor. */
    cerrarSesion = (): void => {
        this.invalidar('Has cerrado sesión correctamente.');
    };
    /**
     * Publica un perfil ya verificado y programa el cierre en el vencimiento original; rechaza fechas vencidas sin ampliar la sesión.
     * @param token - JWT de la sesión vigente; no se envía en la URL.
     * @param usuario - Cuenta o ID al que corresponde la operación.
     * @param venceEn - Vencimiento absoluto original expresado en milisegundos.
     */
    private aceptar(token: string, usuario: Usuario, venceEn: number): void {
        if (venceEn <= this.deps.ahora())
            throw new Error('Tu sesión ha vencido. Inicia sesión nuevamente.');
        if (this.temporizador)
            this.deps.cancelar(this.temporizador);
        this.publicar({ estado: 'autenticado', sesion: { token, usuario, venceEn }, cargando: false, error: '', mensaje: '' });
        this.temporizador = this.deps.programar(/** Comprueba el vencimiento cuando se cumple el temporizador de la sesión aceptada. */ () => this.comprobarVencimiento(), Math.min(venceEn - this.deps.ahora(), 2147483647));
    }
    /** Se ejecuta también al navegar/regresar a la pestaña; no depende solo de setTimeout. */
    comprobarVencimiento = (): void => {
        const sesion = this.estado.sesion;
        if (!sesion)
            return;
        if (sesion.venceEn <= this.deps.ahora())
            this.invalidar('Tu sesión ha vencido. Inicia sesión nuevamente.');
        else
            this.aceptar(sesion.token, sesion.usuario, sesion.venceEn);
    };
    /**
     * Restaura/revalida mediante /me. Un fallo de red bloquea la vista privada y permite
     * reintentar; no confunde indisponibilidad con token inválido ni borra un JWT vigente.
     */
    recuperar = (): Promise<void> => {
        // focus/pageshow/visibilitychange pueden coincidir. Solo se comparte la solicitud
        // pendiente de la misma operación; logout, vencimiento o login invalidan su versión.
        if (this.recuperacionEnCurso?.version === this.operacion)
            return this.recuperacionEnCurso.promesa;
        const promesa = this.recuperarAhora();
        const pendiente = { version: this.operacion, promesa };
        this.recuperacionEnCurso = pendiente;
        /**
         * Retira únicamente la referencia a esta recuperación terminada, tanto si resolvió como si falló.
         * Una recuperación posterior conserva su propia referencia; aquí no se elimina el JWT ni se altera su vencimiento.
         */
        const limpiar = () => {
            if (this.recuperacionEnCurso === pendiente)
                this.recuperacionEnCurso = undefined;
        };
        void promesa.then(limpiar, limpiar);
        return promesa;
    };
    /**
     * Lee el JWT, valida su vencimiento y consulta /me antes de publicar contenido privado; descarta respuestas antiguas y diferencia rechazo de credenciales de indisponibilidad de red.
     */
    private recuperarAhora = async (): Promise<void> => {
        const version = ++this.operacion;
        if (this.temporizador)
            this.deps.cancelar(this.temporizador);
        this.publicar({ ...inicial });
        let token: string | null;
        let venceEn: number;
        try {
            token = this.deps.storage.leer();
            if (!token) {
                this.invalidar('');
                return;
            }
            venceEn = obtenerVencimiento(token);
            if (venceEn <= this.deps.ahora()) {
                this.invalidar('Tu sesión ha vencido. Inicia sesión nuevamente.');
                return;
            }
        }
        catch {
            this.invalidar('No se pudo recuperar la sesión. Inicia sesión nuevamente.');
            return;
        }
        // El token también vence si /me queda pendiente o falla: nunca se aplaza por la red.
        this.temporizador = this.deps.programar(/** Invalida la recuperación vigente si vence su JWT mientras /me sigue pendiente. */ () => {
            if (version === this.operacion)
                this.invalidar('Tu sesión ha vencido. Inicia sesión nuevamente.');
        }, Math.min(venceEn - this.deps.ahora(), 2147483647));
        try {
            const perfil = await this.deps.api.obtenerMiUsuario(token);
            if (version !== this.operacion)
                return;
            this.aceptar(token, perfil.usuario, venceEn);
        }
        catch (fallo) {
            if (version !== this.operacion)
                return;
            if (fallo instanceof ApiError && (fallo.status === 401 || fallo.status === 403)) {
                this.invalidar(fallo.status === 403 ? 'No tienes permiso para acceder al sistema.' : 'Tu sesión no es válida. Inicia sesión nuevamente.');
            }
            else {
                this.publicar({ ...inicial, estado: 'error', error: fallo instanceof Error ? fallo.message : 'No se pudo verificar la sesión.' });
            }
        }
    };
    /** Autentica, verifica /me y persiste solo el JWT; usuario y contraseña nunca se almacenan. */
    ingresar = async (datos: LoginInput): Promise<void> => {
        if (this.estado.cargando || this.estado.estado === 'verificando')
            return;
        const version = ++this.operacion;
        this.publicar({ ...this.estado, cargando: true, error: '', mensaje: '' });
        try {
            const respuesta = await this.deps.api.iniciarSesion(datos);
            const venceEn = Math.min(obtenerVencimiento(respuesta.token), this.deps.ahora() + respuesta.expiresIn * 1000);
            const perfil = await this.deps.api.obtenerMiUsuario(respuesta.token);
            if (version !== this.operacion)
                return;
            if (perfil.usuario.id !== respuesta.usuario.id)
                throw new Error('No se pudo validar el usuario de la sesión.');
            if (venceEn <= this.deps.ahora())
                throw new Error('Tu sesión ha vencido. Inicia sesión nuevamente.');
            this.deps.storage.guardar(respuesta.token);
            this.aceptar(respuesta.token, perfil.usuario, venceEn);
        }
        catch (fallo) {
            if (version !== this.operacion)
                return;
            const errorStorage = this.limpiar();
            this.publicar({ estado: 'anonimo', sesion: null, cargando: false,
                error: errorStorage || (fallo instanceof Error ? fallo.message : 'No se pudo iniciar sesión.'), mensaje: '' });
        }
    };
}
