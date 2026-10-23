import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { abrirQa } from './neon-qa-guard.mjs';
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';

// Las suites de fixtures no pueden recibir por herencia una API remota ajena a QA.
if (process.env.QA_HTTP_BASE && new URL(process.env.QA_HTTP_BASE).hostname !== '127.0.0.1') {
    throw new Error('Las suites Neon QA solo admiten HTTP local; verificar el despliegue remoto por separado.');
}

// La guarda verifica host y Branch ID antes de entregar el entorno a las suites.
const { qa, pool } = await abrirQa();
await pool.end();
const archivo = process.argv[2];
if (!['dashboard.integration.mjs', 'flujo-migration.integration.mjs'].includes(archivo)) {
    throw new Error('Suite QA no permitida');
}
const resultado = spawnSync(process.execPath, ['--test', 'tests/' + archivo], {
    env: { ...process.env, ...qa, DOTENV_CONFIG_PATH: '.env.neon.qa', NEON_QA_TESTS: '1',
        QA_FIXTURE_SUFFIX: '_' + randomUUID().slice(0, 8),
        VALIDAR_FLUJO_DOCUMENTAL: 'ROLLBACK_Y_QA_AISLADA' },
    encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 8 * 1024 * 1024,
});
// Los fallos SQL pueden contener fixtures; conservar salida solo en el directorio privado.
mkdirSync('../.private/render', { recursive: true });
writeFileSync('../.private/render/node-' + archivo + '.log', (resultado.stdout ?? '') + (resultado.stderr ?? ''));
console.log('Suite Neon QA:', { archivo, codigo: resultado.status,
    pruebas: resultado.stdout?.match(/tests\s+(\d+)/)?.[1] ?? null,
    aprobadas: resultado.stdout?.match(/pass\s+(\d+)/)?.[1] ?? null,
    fallidas: resultado.stdout?.match(/fail\s+(\d+)/)?.[1] ?? null });
process.exitCode = resultado.status ?? 1;
