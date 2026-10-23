import { pool, verificarBaseDatos } from '../dist/config/database.js';
// No muestra datos personales ni credenciales. Toda consulta queda dentro de READ ONLY.
let cliente;
try {
    await verificarBaseDatos();
    cliente = await pool.connect();
    await cliente.query('BEGIN READ ONLY');
    await cliente.query("SET LOCAL statement_timeout = '5s'");
    const columnas = await cliente.query(`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('usuarios', 'roles', 'oficinas')
    ORDER BY table_name, ordinal_position`);
    console.log('Columnas:', JSON.stringify(columnas.rows));
    const calidad = await cliente.query(`SELECT
    count(*)::int AS usuarios,
    count(*) FILTER (WHERE u.activo)::int AS activos,
    count(*) FILTER (WHERE u.nombre_usuario <> lower(u.nombre_usuario))::int AS nombres_con_mayusculas,
    count(*) FILTER (WHERE u.version_autenticacion IS NULL OR u.version_autenticacion < 0)::int AS versiones_invalidas,
    count(*) FILTER (WHERE r.id IS NULL)::int AS roles_ausentes,
    count(*) FILTER (WHERE u.contrasena_hash IS NULL OR u.contrasena_hash !~ '^scrypt\\$16384\\$8\\$1\\$[0-9a-fA-F]{32}\\$[0-9a-fA-F]{128}$')::int AS hashes_no_compatibles
    FROM public.usuarios u LEFT JOIN public.roles r ON r.id = u.rol_id`);
    console.log('Resumen agregado:', JSON.stringify(calidad.rows[0]));
    const restricciones = await cliente.query(`SELECT tablename, indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND tablename IN ('usuarios', 'roles', 'oficinas')`);
    console.log('Índices:', JSON.stringify(restricciones.rows));
    const condiciones = await cliente.query(`SELECT conrelid::regclass::text AS tabla, pg_get_constraintdef(oid) AS definicion
    FROM pg_constraint WHERE conrelid IN ('public.usuarios'::regclass, 'public.roles'::regclass, 'public.oficinas'::regclass)`);
    console.log('Restricciones:', JSON.stringify(condiciones.rows));
    await cliente.query('ROLLBACK');
    console.log('Verificación de lectura completada; no se modificaron datos ni esquema.');
}
catch (error) {
    if (cliente)
        await cliente.query('ROLLBACK').catch(/** Permite continuar la limpieza de recursos después de un fallo previo; el caso conserva su error original. */ () => {
        });
    console.error('No se completó la verificación de lectura:', { tipo: error.name, codigo: error.code ?? null });
    process.exitCode = 1;
}
finally {
    cliente?.release();
    await pool.end();
}
