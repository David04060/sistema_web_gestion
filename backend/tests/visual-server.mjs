/** Servidor temporal para QA del frontend. Solo datos ficticios y pool sustituido; nunca usa PostgreSQL. */
process.env.DATABASE_URL = 'postgresql://fixture:fixture@127.0.0.1:1/fixture';
process.env.JWT_SECRET = 'secreto-exclusivo-de-pruebas-visuales-000000';
const { app } = await import('../dist/app.js');
const { pool } = await import('../dist/config/database.js');
const { generarHash } = await import('../dist/shared/security/password.js');
const fixture = {
    id: '1', nombre: 'Usuario', apellido: 'de prueba local', nombre_usuario: 'fixture', email: null,
    rol: 'Prueba', oficina: null, activo: true, version_autenticacion: 0,
    contrasena_hash: await generarHash('Prueba-visual-123'),
};
pool.query = /** Sustituye el repositorio por consultas controladas del caso para comprobar contratos sin escrituras reales. */
    async (_sql, parametros) => ({ rows: parametros[0] === 'fixture' || parametros[0] === '1' ? [fixture] : [] });
const servidor = app.listen(3107, '127.0.0.1', /** Informa el arranque del servidor visual de fixtures, separado de las conexiones PostgreSQL. */ () => {
    console.log('QA visual con datos ficticios en 127.0.0.1:3107; sin conexión PostgreSQL.');
});
servidor.on('error', /** Gestiona el evento del recurso local de pruebas y solicita su cierre o continuación controlada. */  error => {
    console.error('No se pudo abrir el puerto de QA:', error.code);
    process.exitCode = 1;
});
process.on('SIGINT', /** Gestiona el evento del recurso local de pruebas y solicita su cierre o continuación controlada. */ () => servidor.close(/** Resuelve la espera de cierre del servidor local para liberar sus recursos antes de continuar. */ () => pool.end()));
