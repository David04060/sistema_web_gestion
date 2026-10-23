import type { PoolClient } from "pg";
import { pool } from "../../config/database.js";
export interface RegistroCatalogo {
    id: string;
    nombre: string;
    fecha_creacion: Date;
    fecha_modificacion: Date;
    usuarios_asociados: number;
}
/** Configuración cerrada: los nombres SQL jamás proceden de parámetros HTTP. */
const configuracion = {
    roles: { tabla: "roles", fk: "rol_id" },
    oficinas: { tabla: "oficinas", fk: "oficina_id" },
} as const;
/** SQL compartido por los dos catálogos, manteniendo repositorios propios por módulo. */
export class CatalogoRepository {
    private config: typeof configuracion[keyof typeof configuracion];
    /**
     * Selecciona una tabla y su clave foránea desde la configuración cerrada de roles u oficinas; no acepta identificadores SQL HTTP.
     * @param tipo - Catálogo permitido por la configuración interna.
     */
    constructor(tipo: keyof typeof configuracion) {
        this.config = configuracion[tipo];
    }
    /**
     * Construye la proyección común del catálogo con el número de cuentas asociadas y fechas existentes.
     * @returns Columnas SQL internas; no ejecuta consultas ni utiliza nombres recibidos por HTTP.
     */
    private columnas(): string {
        return `c.id::text, c.nombre, c.fecha_creacion, c.fecha_modificacion,
      (SELECT count(*)::int FROM usuarios u WHERE u.${this.config.fk}=c.id) AS usuarios_asociados`;
    }
    /**
     * Consulta el catálogo configurado ordenado por nombre e ID con el conteo de asociaciones.
     * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
     */
    async listar(): Promise<RegistroCatalogo[]> {
        const resultado = await pool.query<RegistroCatalogo>(`SELECT ${this.columnas()} FROM ${this.config.tabla} c ORDER BY c.nombre,c.id`);
        return resultado.rows;
    }
    /**
     * Obtiene un registro del catálogo mediante ID parametrizado; devuelve null si no existe.
     * @param id - Identificador textual del registro al que se aplica esta operación.
     * @param cliente - Conexión PostgreSQL de la transacción actual.
     * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
     */
    async obtener(id: string, cliente?: PoolClient): Promise<RegistroCatalogo | null> {
        const resultado = await (cliente ?? pool).query<RegistroCatalogo>(`SELECT ${this.columnas()} FROM ${this.config.tabla} c WHERE c.id=$1::bigint`, [id]);
        return resultado.rows[0] ?? null;
    }
    /**
     * Lista las cuentas relacionadas con el catálogo sin incluir hashes ni información de autenticación.
     * @param id - Identificador textual del registro al que se aplica esta operación.
     * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
     */
    async asociados(id: string) {
        const resultado = await pool.query<{
            id: string;
            nombre: string;
            apellido: string;
            nombre_usuario: string;
            activo: boolean;
        }>(`SELECT id::text,nombre,apellido,nombre_usuario,activo FROM usuarios
       WHERE ${this.config.fk}=$1::bigint ORDER BY apellido,nombre,id`, [id]);
        return resultado.rows;
    }
    /** El bloqueo administrativo hace atómica la comprobación de espacios internos y escritura. */
    async duplicado(nombre: string, excluir: string | null, cliente: PoolClient): Promise<boolean> {
        const resultado = await cliente.query(`SELECT 1 FROM ${this.config.tabla}
       WHERE lower(regexp_replace(btrim(nombre), '[[:space:]]+', ' ', 'g'))=lower($1)
       AND ($2::bigint IS NULL OR id<>$2::bigint) LIMIT 1`, [nombre, excluir]);
        return resultado.rows.length > 0;
    }
    /**
     * Inserta un nombre en la tabla permitida y devuelve el ID textual dentro de la transacción del servicio.
     * @param nombre - Denominación del registro que se consulta o conserva.
     * @param cliente - Conexión PostgreSQL de la transacción actual.
     * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
     */
    async crear(nombre: string, cliente: PoolClient): Promise<string> {
        const resultado = await cliente.query<{
            id: string;
        }>(`INSERT INTO ${this.config.tabla}(nombre) VALUES($1) RETURNING id::text`, [nombre]);
        return resultado.rows[0]!.id;
    }
    /**
     * Renombra el registro seleccionado conservando su ID y las cuentas asociadas.
     * @param id - Identificador textual del registro al que se aplica esta operación.
     * @param nombre - Denominación del registro que se consulta o conserva.
     * @param cliente - Conexión PostgreSQL de la transacción actual.
     * @throws Error de PostgreSQL si falla la consulta; el servicio y el middleware gestionan su traducción pública.
     */
    async actualizar(id: string, nombre: string, cliente: PoolClient): Promise<void> {
        await cliente.query(`UPDATE ${this.config.tabla} SET nombre=$2 WHERE id=$1::bigint`, [id, nombre]);
    }
}
