import { app } from "./app.js";
import { env } from "./config/env.js";
import { verificarBaseDatos, cerrarBaseDatos, } from "./config/database.js";
/** Verifica la base antes de escuchar y registra un apagado ordenado de HTTP y PostgreSQL. */
async function iniciarServidor(): Promise<void> {
    await verificarBaseDatos();
    const servidor = app.listen(env.PORT, '0.0.0.0', /** Informa que HTTP empezó a escuchar después de verificar la base de datos. */ () => {
        console.log(`Backend ejecutándose en http://localhost:${env.PORT}`);
    });
    servidor.on("error", /** Gestiona un fallo al escuchar HTTP y solicita liberar el pool antes de terminar con error. */ () => {
        console.error("No se pudo abrir el puerto HTTP del backend.");
        void cerrarBaseDatos().catch(/** Informa que el pool no pudo cerrarse durante el fallo de arranque HTTP. */ () => {
            console.error("No se pudo cerrar el pool PostgreSQL.");
        }).finally(/** Marca el proceso como fallido después de intentar liberar recursos. */ () => {
            process.exitCode = 1;
        });
    });
    let cerrando = false;
    /**
     * Evita cierres simultáneos, deja finalizar HTTP y libera el pool PostgreSQL; informa fallos de cierre sin imprimir credenciales.
     */
    async function cerrarServidor(): Promise<void> {
        if (cerrando)
            return;
        cerrando = true;
        console.log("Cerrando servidor...");
        servidor.close(/** Libera PostgreSQL cuando HTTP termina de cerrar e informa errores sin reabrir conexiones. */ async (error) => {
            if (error) {
                console.error("Error al cerrar HTTP:", error);
                process.exitCode = 1;
            }
            try {
                await cerrarBaseDatos();
            }
            catch (error) {
                console.error("Error al cerrar PostgreSQL:", error instanceof Error ? error.name : "Error desconocido");
                process.exitCode = 1;
            }
        });
    }
    process.on("SIGINT", /** Solicita un cierre ordenado al recibir SIGINT. */ () => {
        void cerrarServidor();
    });
    process.on("SIGTERM", /** Solicita un cierre ordenado al recibir SIGTERM. */ () => {
        void cerrarServidor();
    });
}
iniciarServidor().catch(/** Gestiona el fallo de arranque, libera el pool y termina con código de error. */ async (error: unknown) => {
    console.error("No se pudo iniciar el backend:", error instanceof Error ? (env.NODE_ENV === "development" ? error.message : error.name) : "Error desconocido");
    await cerrarBaseDatos().catch(/** Informa un fallo de cierre del pool durante la recuperación del arranque. */ () => {
        console.error("No se pudo cerrar el pool PostgreSQL.");
    });
    process.exitCode = 1;
});
