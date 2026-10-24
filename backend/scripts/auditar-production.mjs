import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { abrirProduccionLectura } from './production-config.mjs';

/** Inventario y coherencia exclusivamente SELECT; los detalles permanecen fuera de Git. */
async function auditar() {
    const sesion = await abrirProduccionLectura();
    const { cliente, configuracion, identidad } = sesion;
    try {
        const proveedor = JSON.parse(readFileSync('../.private/production/neon-metadata.json'));
        assert.equal(configuracion.NEON_BRANCH_ID, proveedor.branchId, 'Branch ID distinto del verificado en Neon');
        assert.equal(configuracion.NEON_PROJECT_ID, proveedor.projectId, 'Project ID distinto del verificado en Neon');
        const tablas = (await cliente.query(`SELECT c.relname nombre,has_table_privilege(c.oid,'SELECT') lectura,
            has_table_privilege(c.oid,'INSERT') insertar,has_table_privilege(c.oid,'UPDATE') actualizar,
            has_table_privilege(c.oid,'DELETE') borrar FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname`)).rows;
        const requeridas = ['usuarios','roles','oficinas','tipos_documentales','estantes','archivadores','documentos',
            'movimientos_documentales','historial_modificaciones','correlativos_documentales','claves_tipos_documentales','autorizaciones_tipos_restringidos'];
        assert.ok(requeridas.every(t => tablas.some(v => v.nombre === t)), 'Faltan tablas requeridas');
        const cantidades = {};
        for (const t of tablas) {
            assert.match(t.nombre, /^[a-z_]+$/);
            cantidades[t.nombre] = Number((await cliente.query(`SELECT count(*) n FROM public."${t.nombre}"`)).rows[0].n);
        }
        const estructura = {};
        estructura.columnas = (await cliente.query(`SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`)).rows;
        estructura.funciones = (await cliente.query(`SELECT p.proname,pg_get_functiondef(p.oid) definicion FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f' ORDER BY p.proname,p.oid`)).rows;
        estructura.triggers = (await cliente.query(`SELECT c.relname tabla,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definicion FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`)).rows;
        estructura.restricciones = (await cliente.query(`SELECT conrelid::regclass::text tabla,conname,convalidated,pg_get_constraintdef(oid) definicion FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conrelid::regclass::text,conname`)).rows;
        estructura.indices = (await cliente.query(`SELECT c.relname tabla,ci.relname nombre,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) definicion FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_class ci ON ci.oid=i.indexrelid WHERE c.relnamespace='public'::regnamespace ORDER BY c.relname,ci.relname`)).rows;
        estructura.secuencias = (await cliente.query(`SELECT sequencename,has_sequence_privilege(format('%I.%I',schemaname,sequencename),'USAGE') uso,has_sequence_privilege(format('%I.%I',schemaname,sequencename),'SELECT') lectura FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`)).rows;
        const rol = (await cliente.query(`SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,
            has_database_privilege(current_database(),'CONNECT') conectar,has_schema_privilege('public','USAGE') usar_schema,
            has_schema_privilege('public','CREATE') crear_en_schema FROM pg_roles WHERE rolname=current_user`)).rows[0];
        const coherencia = (await cliente.query(`SELECT
            (SELECT count(*) FROM documentos WHERE estado_tramite NOT IN ('PENDIENTE_DECISION','EN_TRASLADO','RECIBIDO','RECHAZADO','CANCELADO')) estados_invalidos,
            (SELECT count(*) FROM usuarios u LEFT JOIN roles r ON r.id=u.rol_id WHERE r.id IS NULL) usuarios_sin_rol,
            (SELECT count(*) FROM usuarios WHERE version_autenticacion IS NULL OR version_autenticacion<0) versiones_invalidas,
            (SELECT count(*) FROM (SELECT codigo FROM documentos GROUP BY codigo HAVING count(*)>1) d) codigos_duplicados,
            (SELECT count(*) FROM (SELECT documento_id FROM movimientos_documentales WHERE estado='EN_TRASLADO' GROUP BY documento_id HAVING count(*)>1) d) traslados_abiertos_duplicados`)).rows[0];
        const administradores = (await cliente.query(`SELECT u.id::text,u.nombre_usuario,u.activo,
            u.contrasena_hash ~ '^scrypt[$]16384[$]8[$]1[$][0-9a-fA-F]{32}[$][0-9a-fA-F]{128}$' hash_compatible,
            u.nombre_usuario ~* '^(qa_|fixture|test_)' posible_sintetico
            FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE r.nombre='Administrador' ORDER BY u.id`)).rows;
        const sinteticos = {
            usuarios: (await cliente.query(`SELECT id::text,nombre_usuario,activo FROM usuarios WHERE nombre_usuario ~* '^(qa_|fixture|test_)' ORDER BY id`)).rows,
            documentos: (await cliente.query(`SELECT id::text FROM documentos WHERE asunto ~* '(fixture|\\mQA\\M|prueba|integraci[oó]n HTTP)' ORDER BY id`)).rows,
        };
        const resumen = { lecturaExclusiva: true, identidadVerificada: true, base: identidad.base_datos, usuario: identidad.usuario,
            version: identidad.version, ramaProductionContrastada: true, tlsVerificado: true, tablas: tablas.length,
            funciones: estructura.funciones.length, triggers: estructura.triggers.length, restricciones: estructura.restricciones.length,
            indices: estructura.indices.length, secuencias: estructura.secuencias.length, rol,
            coherencia, administradoresActivos: administradores.filter(a => a.activo).length,
            administradoresNoSinteticosActivos: administradores.filter(a => a.activo && !a.posible_sintetico).length,
            candidatosSinteticos: { usuarios: sinteticos.usuarios.length, documentos: sinteticos.documentos.length },
            estructuraSha256: createHash('sha256').update(JSON.stringify(estructura)).digest('hex'),
            restriccionesNoValidadas: estructura.restricciones.filter(c => !c.convalidated).length,
            indicesInvalidos: estructura.indices.filter(i => !i.indisvalid || !i.indisready).length };
        mkdirSync('../.private/production', { recursive: true });
        writeFileSync('../.private/production/AUDITORIA_PRIVADA.json', JSON.stringify({ resumen, tablas, cantidades, estructura, administradores, candidatosSinteticos: sinteticos }, null, 2));
        writeFileSync('../.private/production/RESUMEN_AUDITORIA.json', JSON.stringify(resumen, null, 2));
        console.log(JSON.stringify(resumen));
    } finally { await sesion.cerrar(); }
}
auditar().catch(error => { console.error('Auditoría production no completada:', { tipo: error.name, codigo: error.code ?? null }); process.exitCode = 1; });
