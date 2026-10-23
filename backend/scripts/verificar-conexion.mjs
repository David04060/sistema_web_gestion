import { verificarBaseDatos, cerrarBaseDatos } from '../dist/config/database.js';

// Reutiliza el pool real; solo consulta identidad, versión y TLS de esta sesión.
try {
    console.log('Identidad PostgreSQL:', await verificarBaseDatos());
} catch (error) {
    console.error('No se pudo verificar PostgreSQL:', { tipo: error.name });
    process.exitCode = 1;
} finally {
    await cerrarBaseDatos();
}
