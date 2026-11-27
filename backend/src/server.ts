/** Archivo: Inicia la API tras comprobar PostgreSQL y cierra conexiones y mantenimiento al detenerse.
 */
import { app } from './app.js';
import { env } from './config/env.js';
import { iniciarMantenimientoPdf } from './modules/documentos-pdf/pdf.maintenance.js';
import { verificarBaseDatos, cerrarBaseDatos } from './config/database.js';
/** Verifica la base antes de escuchar y registra un apagado ordenado de HTTP y PostgreSQL. */
async function iniciarServidor(): Promise<void> {
  await verificarBaseDatos();
  const detenerMantenimientoPdf = iniciarMantenimientoPdf();
  const servidor = app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`Backend ejecutándose en http://localhost:${env.PORT}`);
  });
  servidor.on('error', () => {
    console.error('No se pudo abrir el puerto HTTP del backend.');
    void cerrarBaseDatos()
      .catch(() => {
        console.error('No se pudo cerrar el pool PostgreSQL.');
      })
      .finally(() => {
        process.exitCode = 1;
      });
  });
  let cerrando = false;
  /**
   * Evita cierres simultáneos, deja finalizar HTTP y libera el pool PostgreSQL; informa fallos de cierre
   * sin imprimir credenciales.
   */
  async function cerrarServidor(): Promise<void> {
    if (cerrando) return;
    cerrando = true;
    detenerMantenimientoPdf();
    console.log('Cerrando servidor...');
    servidor.close(async (error) => {
      if (error) {
        console.error('Error al cerrar HTTP:', error);
        process.exitCode = 1;
      }
      try {
        await cerrarBaseDatos();
      } catch (error) {
        console.error(
          'Error al cerrar PostgreSQL:',
          error instanceof Error ? error.name : 'Error desconocido',
        );
        process.exitCode = 1;
      }
    });
  }
  process.on('SIGINT', () => {
    void cerrarServidor();
  });
  process.on('SIGTERM', () => {
    void cerrarServidor();
  });
}
iniciarServidor().catch(async (error: unknown) => {
  console.error(
    'No se pudo iniciar el backend:',
    error instanceof Error
      ? env.NODE_ENV === 'development'
        ? error.message
        : error.name
      : 'Error desconocido',
  );
  await cerrarBaseDatos().catch(() => {
    console.error('No se pudo cerrar el pool PostgreSQL.');
  });
  process.exitCode = 1;
});
