import { escrituraAdministrativa } from "./admin.repository.js";
import { nombreCanonico } from "./admin.schema.js";
import { CatalogoRepository, type RegistroCatalogo } from "./catalogo.repository.js";
import { HttpError } from "../http/HttpError.js";
/** Negocio compartido: unicidad normalizada, consulta y protección aprobada de denominaciones. */
export class CatalogoService {
    /**
     * Recibe el repositorio del catálogo y sus nombres reservados para aplicar las mismas reglas en roles y oficinas.
     * @param repository - Repositorio del catálogo configurado por el módulo.
     * @param reservados - Denominaciones institucionales cuya edición debe protegerse.
     */
    constructor(private repository: CatalogoRepository, private reservados: readonly string[]) {
    }
    /**
     * Añade el indicador de reserva comparando nombres canónicos; no modifica el registro persistido.
     * @param registro - Fila consultada que debe proyectarse sin modificar la persistencia.
     */
    private presentar(registro: RegistroCatalogo) {
        return { ...registro, reservado: this.reservados.some(/** Reconoce una denominación reservada mediante comparación canónica. */  nombre => nombreCanonico(nombre) === nombreCanonico(registro.nombre)) };
    }
    /**
     * Consulta el catálogo y marca sus denominaciones reservadas antes de enviarlo al controlador.
     */
    async listar() {
        return (await this.repository.listar()).map(/** Añade la condición de reserva a cada registro del catálogo. */  registro => this.presentar(registro));
    }
    /**
     * Obtiene el catálogo con sus usuarios asociados o genera 404 si el registro no existe.
     * @param id - Identificador textual del registro al que se aplica esta operación.
     */
    async detalle(id: string) {
        const registro = await this.repository.obtener(id);
        if (!registro)
            throw new HttpError(404, "Registro no encontrado");
        return { registro: this.presentar(registro), usuarios: await this.repository.asociados(id) };
    }
    /** Crea o renombra con unicidad normalizada, auditoría y protección de los nombres reservados. */
    async guardar(actor: string, nombre: string, id?: string) {
        /** Comprueba existencia, reserva y unicidad bajo bloqueo antes de crear o renombrar el registro. */
        return escrituraAdministrativa(actor, async (cliente) => {
            if (id) {
                const actual = await this.repository.obtener(id, cliente);
                if (!actual)
                    throw new HttpError(404, "Registro no encontrado");
                if (this.presentar(actual).reservado && nombre !== actual.nombre) {
                    throw new HttpError(409, "Esta denominación institucional está reservada y no puede modificarse");
                }
            }
            if (await this.repository.duplicado(nombre, id ?? null, cliente)) {
                throw new HttpError(409, "Ya existe un registro con ese nombre, considerando mayúsculas y espacios");
            }
            const registroId = id ?? await this.repository.crear(nombre, cliente);
            if (id)
                await this.repository.actualizar(id, nombre, cliente);
            return this.presentar((await this.repository.obtener(registroId, cliente))!);
        });
    }
}
