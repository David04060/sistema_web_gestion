import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
/**
 * Integración autorizada con SQL real y una transacción exterior en la base existente.
 * Solo BEGIN/COMMIT interiores se traducen a savepoints; todas las consultas reales,
 * restricciones, hashes, JWT y triggers se ejecutan. nextval puede dejar huecos.
 */
export async function abrirSandbox(puerto = 0) {
    if (process.env.ADMIN_WRITE_TESTS !== 'ROLLBACK_AUTHORIZED') {
        throw new Error('Se requiere ADMIN_WRITE_TESTS=ROLLBACK_AUTHORIZED para probar escrituras en la base existente.');
    }
    process.env.JWT_SECRET = `clave-efimera-de-integracion-${randomUUID()}`;
    const { pool } = await import('../dist/config/database.js');
    const { app } = await import('../dist/app.js');
    const { generarToken } = await import('../dist/shared/security/jwt.js');
    const cliente = await pool.connect();
    const originalQuery = pool.query;
    const originalConnect = pool.connect;
    let servidor;
    let contador = 0;
    let cola = Promise.resolve();
    /** Obtiene huellas agregadas de las tablas para comparar el estado después del rollback sin imprimir sus filas. */
    const firma = async () => (await cliente.query(`SELECT jsonb_build_object(
    'roles',(SELECT md5(coalesce(string_agg(to_jsonb(r)::text,'' ORDER BY id),'')) FROM roles r),
    'oficinas',(SELECT md5(coalesce(string_agg(to_jsonb(o)::text,'' ORDER BY id),'')) FROM oficinas o),
    'usuarios',(SELECT md5(coalesce(string_agg(to_jsonb(u)::text,'' ORDER BY id),'')) FROM usuarios u),
    'movimientos',(SELECT md5(coalesce(string_agg(to_jsonb(m)::text,'' ORDER BY id),'')) FROM movimientos_documentales m),
    'documentos',(SELECT md5(coalesce(string_agg(to_jsonb(d)::text,'' ORDER BY id),'')) FROM documentos d),
    'tipos',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM tipos_documentales t),
    'estantes',(SELECT md5(coalesce(string_agg(to_jsonb(e)::text,'' ORDER BY id),'')) FROM estantes e),
    'archivadores',(SELECT md5(coalesce(string_agg(to_jsonb(a)::text,'' ORDER BY id),'')) FROM archivadores a),
    'correlativos',(SELECT md5(coalesce(string_agg(to_jsonb(c)::text,'' ORDER BY tipo_documental_id,anio),'')) FROM correlativos_documentales c),
    'auditoria',(SELECT md5(coalesce(string_agg(to_jsonb(h)::text,'' ORDER BY id),'')) FROM historial_modificaciones h)
  ) AS firma`)).rows[0].firma;
    let antes;
    try {
        const baseEsperada = process.env.DB_QA_AUTORIZADA ?? 'sistema_web_final';
        if (process.env.DB_QA_AUTORIZADA) {
            if (process.env.NEON_QA_TESTS === '1') {
                const { cargarQa } = await import('../scripts/neon-qa-guard.mjs');
                const qa = cargarQa();
                assert.ok(process.env.DATABASE_URL === qa.DATABASE_URL, 'La suite no usa la URL QA validada');
                assert.equal(baseEsperada, 'neondb');
                assert.equal((await cliente.query("SELECT current_setting('neon.branch_id',true) rama")).rows[0].rama, qa.NEON_BRANCH_ID);
            } else {
                assert.match(baseEsperada, /^sistema_web_final_qa_flujo_[a-f0-9]{32}$/);
            }
        }
        assert.equal((await cliente.query('SELECT current_database() AS nombre')).rows[0].nombre, baseEsperada);
        antes = await firma();
        await cliente.query('BEGIN');
        const original = (await cliente.query(`SELECT u.id::text,u.version_autenticacion FROM usuarios u JOIN roles r ON r.id=u.rol_id
      WHERE u.activo AND r.nombre='Administrador' ORDER BY u.id LIMIT 1`)).rows[0];
        assert.ok(original, 'No hay Administrador activo para autorizar los datos transaccionales.');
        if (process.env.NEON_QA_TESTS === '1') {
            // La rama clonada conserva administradores anteriores. Preparar el caso
            // del último administrador SOLO dentro del rollback exterior validado.
            await cliente.query("SELECT set_config('app.usuario_actor_id',$1,true)", [original.id]);
            await cliente.query(`UPDATE usuarios SET activo=false WHERE id<>$1 AND activo
                AND rol_id IN (SELECT id FROM roles WHERE nombre='Administrador')`, [original.id]);
        }
        pool.query = /** Sustituye el repositorio por consultas controladas del caso para comprobar contratos sin escrituras reales. */
            (sql, valores) => cliente.query(sql, valores);
        pool.connect = /** Serializa el cliente del sandbox mediante savepoints manteniendo la transacción exterior de rollback. */
            async () => {
                const anterior = cola;
                let liberar;
                cola = new Promise(/** Enlaza la finalización asíncrona del recurso o respuesta controlada con la promesa que espera la prueba. */  resolve => {
                    liberar = resolve;
                });
                await anterior;
                const savepoint = `escritura_qa_${++contador}`;
                return {
                    /** Implementa la consulta del adaptador local del caso; conserva la captura o traducción transaccional definida en este entorno de pruebas. */
                    async query(sql, valores) {
                        if (sql === 'BEGIN')
                            return cliente.query(`SAVEPOINT ${savepoint}`);
                        if (sql === 'COMMIT')
                            return cliente.query(`RELEASE SAVEPOINT ${savepoint}`);
                        if (sql === 'ROLLBACK') {
                            await cliente.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
                            return cliente.query(`RELEASE SAVEPOINT ${savepoint}`);
                        }
                        return cliente.query(sql, valores);
                    },
                    /** Libera el turno del cliente simulado por el sandbox para que continúe la siguiente escritura serializada. */
                    release() {
                        liberar();
                    },
                };
            };
        servidor = app.listen(puerto, '127.0.0.1');
        await new Promise(/** Enlaza la finalización asíncrona del recurso o respuesta controlada con la promesa que espera la prueba. */ (resolve, reject) => {
            servidor.once('listening', resolve);
            servidor.once('error', reject);
        });
        return {
            base: `http://127.0.0.1:${servidor.address().port}`,
            cliente,
            tokenInicial: generarToken(original.id, original.version_autenticacion),
            idInicial: original.id,
            /** Cierra los recursos abiertos por esta ejecución y revierte el entorno transaccional cuando corresponde. */
            async cerrar() {
                await new Promise(/** Enlaza la finalización asíncrona del recurso o respuesta controlada con la promesa que espera la prueba. */  resolve => servidor.close(resolve));
                await cliente.query('ROLLBACK');
                pool.query = originalQuery;
                pool.connect = originalConnect;
                const despues = await firma();
                assert.equal(JSON.stringify(despues), JSON.stringify(antes), 'La huella de los registros no coincide tras ROLLBACK.');
                cliente.release();
                await pool.end();
                console.log('ROLLBACK verificado: catalogos, usuarios, ubicaciones, correlativos y auditoria conservan su huella original. Secuencias excluidas.');
            },
        };
    }
    catch (error) {
        if (servidor)
            await new Promise(/** Enlaza la finalización asíncrona del recurso o respuesta controlada con la promesa que espera la prueba. */  resolve => servidor.close(resolve));
        await cliente.query('ROLLBACK').catch(/** Permite continuar la limpieza de recursos después de un fallo previo; el caso conserva su error original. */ () => {
        });
        pool.query = originalQuery;
        pool.connect = originalConnect;
        cliente.release();
        await pool.end();
        throw error;
    }
}
