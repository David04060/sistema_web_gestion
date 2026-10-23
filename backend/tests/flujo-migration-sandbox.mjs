import { URL } from 'node:url';
import assert from 'node:assert/strict';
import pg from 'pg';
import 'dotenv/config';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
/** Instantanea sin contenido privado: estructura y huellas de filas. */
export async function instantanea(cliente) {
    const estructura = (await cliente.query(`SELECT jsonb_build_object(
 'columnas',(SELECT jsonb_agg(to_jsonb(c) ORDER BY table_name,ordinal_position) FROM information_schema.columns c WHERE table_schema='public'),
 'funciones',(SELECT jsonb_agg(jsonb_build_object('nombre',p.proname,'sql',pg_get_functiondef(p.oid)) ORDER BY p.proname) FROM pg_proc p WHERE pronamespace='public'::regnamespace AND prokind='f'),
 'restricciones',(SELECT jsonb_agg(jsonb_build_object('nombre',conname,'tabla',conrelid::regclass::text,'sql',pg_get_constraintdef(oid)) ORDER BY conrelid::regclass::text,conname) FROM pg_constraint WHERE connamespace='public'::regnamespace),
 'indices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY tablename,indexname) FROM pg_indexes i WHERE schemaname='public'),
 'triggers',(SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace='public'::regnamespace)) estado`)).rows[0].estado;
    const tablas = (await cliente.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
    const datos = {};
    for (const { tablename } of tablas) {
        assert.match(tablename, /^[a-z_]+$/);
        datos[tablename] = (await cliente.query(`SELECT count(*)::int cantidad,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) huella FROM public."${tablename}" t`)).rows[0];
    }
    return { estructura, datos };
}
/** Comprueba que el SQL tenga exactamente un BEGIN y un COMMIT y retira solo esos delimitadores para probarlo bajo rollback. */
function sinTransaccion(sql) {
    assert.equal((sql.match(/^BEGIN;$/gm) || []).length, 1);
    assert.equal((sql.match(/^COMMIT;$/gm) || []).length, 1);
    return sql.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');
}
/** El archivo conserva COMMIT; el verificador lo retira en memoria y siempre revierte el DDL institucional. */
export async function prepararValidacion() {
    if (process.env.NEON_QA_TESTS === '1') {
        const { abrirQa } = await import('../scripts/neon-qa-guard.mjs');
        const { pool, qa } = await abrirQa();
        assert.ok(process.env.DATABASE_URL === qa.DATABASE_URL, 'La suite no usa la URL QA validada');
        return { pool, nombre: 'neondb', sha256: null, original: qa.DATABASE_URL,
            connectionString: qa.DATABASE_URL, limpiar: async () => {
                await pool.end();
                console.log('Conexiones QA cerradas; rama conservada con fixtures. Sin DDL ni limpieza.');
            } };
    }
    assert.equal(process.env.VALIDAR_FLUJO_DOCUMENTAL, 'ROLLBACK_Y_QA_AISLADA', 'Se requiere autorizacion de prueba aislada.');
    const original = process.env.DATABASE_URL;
    assert.ok(original);
    const origen = new pg.Pool({ connectionString: original, max: 2 });
    const c = await origen.connect();
    const nombre = `sistema_web_final_qa_flujo_${randomUUID().replaceAll('-', '')}`;
    assert.match(nombre, /^sistema_web_final_qa_flujo_[a-f0-9]{32}$/);
    assert.notEqual(nombre, 'sistema_web_final');
    const sql = await readFile('scripts/sql/20261021-flujo-documental-cinco-estados.sql', 'utf8');
    const sha256 = createHash('sha256').update(sql).digest('hex');
    let creado = false;
    let pool;
    let antes;
    let oidCreado;
    /** Cierra el pool QA, elimina únicamente la base temporal cuyo nombre y OID coinciden y comprueba las huellas del origen antes de liberar conexiones. */
    const limpiar = async () => {
        if (pool)
            await pool.end();
        if (creado) {
            const fila = (await c.query('SELECT oid FROM pg_database WHERE datname=$1', [nombre])).rows[0];
            assert.equal(fila?.oid, oidCreado, 'La base temporal no coincide con la creada por esta prueba.');
            await c.query(`DROP DATABASE "${nombre}" WITH (FORCE)`);
            creado = false;
        }
        if (antes)
            assert.deepEqual(await instantanea(c), antes, 'La estructura o los datos institucionales cambiaron.');
        c.release();
        await origen.end();
    };
    try {
        assert.equal((await c.query('SELECT current_database() nombre')).rows[0].nombre, 'sistema_web_final');
        antes = await instantanea(c);
        const aplicada = (await c.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='documentos' AND column_name='destinatario_autorizado_id'")).rows[0].n === 1;
        if (!aplicada)
            try {
                await c.query('BEGIN');
                await c.query(sinTransaccion(sql));
                assert.equal((await c.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='documentos' AND column_name IN ('destinatario_autorizado_id','oficina_destino_autorizada_id','decision_autorizada_por_id')")).rows[0].n, 3);
            }
            finally {
                await c.query('ROLLBACK');
            }
        assert.deepEqual(await instantanea(c), antes, 'ROLLBACK de DDL no restauro la estructura y los datos.');
        console.log(aplicada ? 'Esquema permanente aprobado detectado; copia QA sin reaplicar DDL.' : 'ROLLBACK del DDL institucional verificado.');
        const url = new URL(original);
        const entorno = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: 'sistema_web_final' };
        const dump = spawnSync('C:/Program Files/PostgreSQL/18/bin/pg_dump.exe', ['--schema-only', '--no-owner', '--no-privileges', '--no-password'], { env: entorno, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true });
        assert.equal(dump.status, 0, 'pg_dump no pudo copiar solo el esquema.');
        await c.query(`CREATE DATABASE "${nombre}" TEMPLATE template0`);
        creado = true;
        oidCreado = (await c.query('SELECT oid FROM pg_database WHERE datname=$1', [nombre])).rows[0].oid;
        const restaurar = spawnSync('C:/Program Files/PostgreSQL/18/bin/psql.exe', ['--no-psqlrc', '--no-password', '--set', 'ON_ERROR_STOP=1'], { input: dump.stdout, env: { ...entorno, PGDATABASE: nombre }, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true });
        assert.equal(restaurar.status, 0, 'No se pudo preparar el esquema aislado.');
        url.pathname = `/${nombre}`;
        pool = new pg.Pool({ connectionString: url.toString(), max: 12 });
        const guarda = "current_database() <> 'sistema_web_final'";
        assert.equal(sql.split(guarda).length, 2);
        if (!aplicada)
            await pool.query(sql.replace(guarda, `current_database() <> '${nombre}'`));
        for (const tabla of ['roles', 'oficinas', 'tipos_documentales']) {
            const campos = tabla === 'tipos_documentales' ? 'id,nombre,prefijo_codigo,requiere_clave' : 'id,nombre';
            const filas = (await c.query(`SELECT ${campos} FROM public.${tabla} ORDER BY id`)).rows;
            for (const fila of filas) {
                const columnas = Object.keys(fila);
                await pool.query(`INSERT INTO ${tabla}(${columnas.join(',')}) OVERRIDING SYSTEM VALUE VALUES(${columnas.map(/** Extrae del resultado de la operación los valores que contrastan las aserciones del escenario QA. */ (_, i) => '$' + (i + 1)).join(',')})`, Object.values(fila));
            }
            // OVERRIDING conserva los IDs del catalogo; solo en QA se alinea su secuencia.
            await pool.query(`SELECT setval(pg_get_serial_sequence($1,'id'),coalesce((SELECT max(id) FROM ${tabla}),1),true)`, [tabla]);
        }
        return { pool, nombre, sha256, original, connectionString: url.toString(), antes, c, limpiar };
    }
    catch (error) {
        await c.query('ROLLBACK').catch(/** Permite continuar la limpieza de recursos después de un fallo previo; el caso conserva su error original. */ () => {
        });
        await limpiar();
        throw error;
    }
}
