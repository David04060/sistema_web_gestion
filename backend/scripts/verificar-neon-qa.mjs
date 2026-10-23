import { abrirQa } from './neon-qa-guard.mjs';

try {
    const { pool, identidad } = await abrirQa();
    console.log('Neon QA verificado:', { base: identidad.base_datos, usuario: identidad.usuario,
        version: identidad.version, rama_coincide: true, host_distinto_principal: true });
    await pool.end();
} catch (error) {
    console.error('No se verificó Neon QA:', { tipo: error.name, codigo: error.code ?? null });
    process.exitCode = 1;
}
