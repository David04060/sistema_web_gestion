import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { prepararValidacion } from './flujo-migration-sandbox.mjs';
/** SQL real en una base efimera: los COMMIT de QA nunca apuntan a sistema_web_final. */
test('Validacion integral de migracion documental, transiciones y concurrencia', /** Verifica el caso «Validacion integral de migracion documental, transiciones y concurrencia»; una aserción fallida invalida este resultado. */ async (t) => {
    const qa = await prepararValidacion();
    const pool = qa.pool;
    const resultados = [];
    const regresiones = [];
    let servidor;
    let appPool;
    let base;
    let tokenDirector;
    let tokenAdmin;
    /** Ejecuta un subcaso de integración, registra su aprobación y propaga el fallo para no continuar como si hubiese pasado. */
    const caso = async (nombre, fn) => {
        let fallo;
        await t.test(nombre, /** Ejecuta el subcaso recibido, registra su aprobación y vuelve a propagar cualquier fallo de aserción. */ async () => {
            try {
                await fn();
                resultados.push(nombre);
            }
            catch (error) {
                fallo = error;
                throw error;
            }
        });
        if (fallo)
            throw fallo;
    };
    /** Ejecuta la operación de prueba con actor y motivo en una transacción QA; confirma o revierte y libera la conexión que adquirió. */
    const tx = async (actor, fn, motivo = 'Validacion aislada autorizada', externo) => {
        const c = externo ?? await pool.connect();
        try {
            await c.query('BEGIN');
            await c.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='8s'");
            await c.query("SELECT set_config('app.usuario_actor_id',$1,true),set_config('app.motivo_documental',$2,true)", [actor, motivo]);
            const r = await fn(c);
            await c.query('SET CONSTRAINTS ALL IMMEDIATE');
            await c.query('COMMIT');
            return r;
        }
        catch (e) {
            await c.query('ROLLBACK');
            throw e;
        }
        finally {
            if (!externo)
                c.release();
        }
    };
    /** Comprueba que la operación falle con el código PostgreSQL esperado para la restricción que se está probando. */
    const rechaza = async (fn, codigo = '23514') => assert.rejects(fn, /** Comprueba que el error capturado coincida con el estado o código esperado por el caso. */  e => e.code === codigo);
    let usuarios, oficinas, tipos, doc, archivo, archivoDestino;
    /** Registra el evento o fixture del entorno de pruebas en su colección o conexión local; no utiliza información institucional para experimentar. */
    const registrar = async (u, asunto = 'Documento QA', cliente) => tx(u.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «Validacion integral de migracion documental, transiciones y concurrencia». */ async (c) => (await c.query(`INSERT INTO documentos(tipo_documental_id,asunto,registrado_por_id,responsable_actual_id,oficina_responsable_id,estado_tramite) VALUES($1,$2,$3,$3,$4,$5) RETURNING *`, [tipos.Informe.id, asunto, u.id, u.oficina_id, u.rol === 'Secretaria de Dirección' ? 'PENDIENTE_DECISION' : 'RECIBIDO'])).rows[0], 'Validacion de registro QA', cliente);
    /** Escribe la tríada de autorización del documento QA bajo el actor de Dirección para probar sus restricciones. */
    const autorizar = async (d, destino) => tx(usuarios.director.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «Validacion integral de migracion documental, transiciones y concurrencia». */  c => c.query('UPDATE documentos SET destinatario_autorizado_id=$2,oficina_destino_autorizada_id=$3,decision_autorizada_por_id=$4 WHERE id=$1', [d.id, destino.id, destino.oficina_id, usuarios.director.id]));
    /** Inserta el movimiento QA con la copia histórica de origen, destino y decisión para comprobar la salida atómica. */
    const insertarSalida = async (c, d, destino, opciones = {}) => (await c.query(`INSERT INTO movimientos_documentales(documento_id,oficina_origen_id,usuario_origen_id,oficina_destino_id,usuario_destino_id,registrado_por_id,decidido_por_id,trasladado_por_id,estado,fecha_salida)
 VALUES($1,$2,$3,$4,$5,$3,$6,$3,'EN_TRASLADO',coalesce($7::timestamptz,clock_timestamp())) RETURNING *`, [d.id, d.oficina_responsable_id, d.responsable_actual_id, destino.oficina_id, destino.id, d.decision_autorizada_por_id ?? null, opciones.fecha ?? null])).rows[0];
    /** Actualiza el documento QA a EN_TRASLADO y consume su autorización para comprobar coherencia con el movimiento. */
    const actualizarSalida = (c, id) => c.query("UPDATE documentos SET estado_tramite='EN_TRASLADO',archivador_id=null,destinatario_autorizado_id=null,oficina_destino_autorizada_id=null,decision_autorizada_por_id=null WHERE id=$1", [id]);
    /** Bloquea el documento QA y confirma movimiento y salida dentro de una única transacción de prueba. */
    const salir = async (id, origen, destino) => tx(origen.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «Validacion integral de migracion documental, transiciones y concurrencia». */ async (c) => {
        const d = (await c.query('SELECT * FROM documentos WHERE id=$1 FOR UPDATE', [id])).rows[0];
        const m = await insertarSalida(c, d, destino);
        await actualizarSalida(c, id);
        return m;
    });
    /** Actualiza movimiento y documento QA para comprobar recepción y transferencia de custodia atómicas. */
    const recibir = async (m, u, ubicacion = null) => tx(u.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «Validacion integral de migracion documental, transiciones y concurrencia». */ async (c) => {
        await c.query("UPDATE movimientos_documentales SET estado='RECIBIDO',recibido_por_id=$2,fecha_recepcion=clock_timestamp() WHERE id=$1", [m.id, u.id]);
        await c.query("UPDATE documentos SET estado_tramite='RECIBIDO',responsable_actual_id=$2,oficina_responsable_id=$3,archivador_id=$4 WHERE id=$1", [m.documento_id, u.id, m.oficina_destino_id, ubicacion]);
    });
    /** Registra el rechazo del movimiento y documento QA para comprobar que se conserva la custodia de origen. */
    const rechazar = async (m, u, motivo = 'Rechazo QA') => tx(u.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «Validacion integral de migracion documental, transiciones y concurrencia». */ async (c) => {
        await c.query("UPDATE movimientos_documentales SET estado='RECHAZADO',rechazado_por_id=$2,fecha_rechazo=clock_timestamp(),motivo_rechazo=$3 WHERE id=$1", [m.id, u.id, motivo]);
        await c.query("UPDATE documentos SET estado_tramite='RECHAZADO' WHERE id=$1", [m.documento_id]);
    });
    /** Registra la recuperación física en origen y restaura el documento QA sin introducir estados nuevos. */
    const recuperar = async (m, u) => tx(u.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «Validacion integral de migracion documental, transiciones y concurrencia». */ async (c) => {
        await c.query('UPDATE movimientos_documentales SET devolucion_confirmada_por_id=$2,fecha_confirmacion_devolucion=clock_timestamp() WHERE id=$1', [m.id, u.id]);
        await c.query("UPDATE documentos SET estado_tramite='RECIBIDO' WHERE id=$1", [m.documento_id]);
    });
    /** Consulta la fila del documento QA para contrastar estado, custodia y autorización después de una operación. */
    const documento = async (id) => (await pool.query('SELECT * FROM documentos WHERE id=$1', [id])).rows[0];
    try {
        await caso('Esquema aprobado: tres FK y triggers diferidos presentes en QA', /** Verifica el caso «Esquema aprobado: tres FK y triggers diferidos presentes en QA»; una aserción fallida invalida este resultado. */ async () => {
            assert.equal((await pool.query("SELECT count(*)::int n FROM pg_constraint WHERE conrelid='documentos'::regclass AND conname IN ('documentos_destinatario_autorizado_id_fkey','documentos_oficina_destino_autorizada_id_fkey','documentos_decision_autorizada_por_id_fkey')")).rows[0].n, 3);
            assert.equal((await pool.query("SELECT count(*)::int n FROM pg_trigger WHERE tgname IN ('ct_documento_circulacion','ct_movimiento_circulacion') AND tgdeferrable AND tginitdeferred")).rows[0].n, 2);
            const { generarHash } = await import('../dist/shared/security/password.js');
            const hash = await generarHash('Prueba-aislada-2026!');
            oficinas = Object.fromEntries((await pool.query('SELECT id,nombre FROM oficinas')).rows.map(/** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ o => [o.nombre, o]));
            tipos = Object.fromEntries((await pool.query('SELECT id,nombre FROM tipos_documentales')).rows.map(/** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ o => [o.nombre, o]));
            const roles = Object.fromEntries((await pool.query('SELECT id,nombre FROM roles')).rows.map(/** Busca por denominación institucional el registro del catálogo que necesita el escenario QA. */ o => [o.nombre, o.id]));
            usuarios = {};
            for (const [clave, rol, oficina] of [['secretaria', 'Secretaria de Dirección', 'Mesa de Partes'], ['director', 'Director(a)', 'Dirección'], ['origen', 'Usuario', 'Subdirección Primaria 1'], ['destino', 'Usuario', 'Subdirección Primaria 2'], ['otro', 'Usuario', 'Subdirección Primaria 2'], ['admin', 'Administrador', 'Dirección']]) {
                const u = (await pool.query(`INSERT INTO usuarios(nombre,apellido,nombre_usuario,contrasena_hash,rol_id,oficina_id) VALUES($1,'QA aislado',$2,$3,$4,$5) RETURNING id,oficina_id`, [clave, 'qa_' + clave + (process.env.QA_FIXTURE_SUFFIX ?? ''), hash, roles[rol], oficinas[oficina].id])).rows[0];
                usuarios[clave] = { ...u, rol };
            }
            /** Crea un estante del usuario QA para comprobar integridad de ubicación y custodia. */
            const estante = async (u) => (await pool.query("INSERT INTO estantes(usuario_id,oficina_id,codigo) VALUES($1,$2,'QA') RETURNING id", [u.id, u.oficina_id])).rows[0].id;
            archivo = (await pool.query('INSERT INTO archivadores(estante_id,numero) VALUES($1,1) RETURNING id', [await estante(usuarios.secretaria)])).rows[0].id;
            archivoDestino = (await pool.query('INSERT INTO archivadores(estante_id,numero) VALUES($1,1) RETURNING id', [await estante(usuarios.destino)])).rows[0].id;
        });
        await caso('registro Mesa de Partes permanece PENDIENTE_DECISION y codigo lo genera PostgreSQL', /** Verifica el caso «registro Mesa de Partes permanece PENDIENTE_DECISION y codigo lo genera PostgreSQL»; una aserción fallida invalida este resultado. */ async () => {
            doc = await registrar(usuarios.secretaria);
            assert.equal(doc.estado_tramite, 'PENDIENTE_DECISION');
            const anio = (await pool.query("SELECT extract(year FROM clock_timestamp() AT TIME ZONE 'America/Lima')::text anio")).rows[0].anio;
            assert.match(doc.codigo, new RegExp('^INF' + anio + '[0-9]{3,}$'));
        });
        await caso('autorizacion completa mantiene estado y no crea movimiento', /** Verifica el caso «autorizacion completa mantiene estado y no crea movimiento»; una aserción fallida invalida este resultado. */ async () => {
            await autorizar(doc, usuarios.destino);
            const d = await documento(doc.id);
            assert.equal(d.estado_tramite, 'PENDIENTE_DECISION');
            assert.equal(d.destinatario_autorizado_id, usuarios.destino.id);
            assert.equal((await pool.query('SELECT count(*)::int n FROM movimientos_documentales WHERE documento_id=$1', [doc.id])).rows[0].n, 0);
        });
        await caso('auditoria DECISION conserva autor, motivo y destino anterior/nuevo', /** Verifica el caso «auditoria DECISION conserva autor, motivo y destino anterior/nuevo»; una aserción fallida invalida este resultado. */ async () => {
            const h = (await pool.query("SELECT * FROM historial_modificaciones WHERE tabla='documentos' AND registro_id=$1 ORDER BY id DESC LIMIT 1", [doc.id])).rows[0];
            assert.equal(h.usuario_actor_id, usuarios.director.id);
            assert.equal(h.campos_modificados._evento_documental.tipo, 'DECISION');
            assert.ok(h.campos_modificados._evento_documental.motivo);
            assert.equal(h.campos_modificados.destinatario_autorizado_id.despues, Number(usuarios.destino.id));
        });
        await caso('autorizacion parcial, usuario no Director y oficina equivocada son rechazados', /** Verifica el caso «autorizacion parcial, usuario no Director y oficina equivocada son rechazados»; una aserción fallida invalida este resultado. */ async () => {
            const d = await registrar(usuarios.secretaria);
            await rechaza(/** Intenta la operación inválida del caso «autorizacion parcial, usuario no Director y oficina equivocada son rechazados» para exigir el rechazo de las restricciones PostgreSQL. */ () => tx(usuarios.director.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «autorizacion parcial, usuario no Director y oficina equivocada son rechazados». */  c => c.query('UPDATE documentos SET destinatario_autorizado_id=$2 WHERE id=$1', [d.id, usuarios.destino.id])));
            await rechaza(/** Intenta la operación inválida del caso «autorizacion parcial, usuario no Director y oficina equivocada son rechazados» para exigir el rechazo de las restricciones PostgreSQL. */ () => tx(usuarios.otro.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «autorizacion parcial, usuario no Director y oficina equivocada son rechazados». */  c => c.query('UPDATE documentos SET destinatario_autorizado_id=$2,oficina_destino_autorizada_id=$3,decision_autorizada_por_id=$4 WHERE id=$1', [d.id, usuarios.destino.id, usuarios.destino.oficina_id, usuarios.otro.id])));
            await rechaza(/** Intenta la operación inválida del caso «autorizacion parcial, usuario no Director y oficina equivocada son rechazados» para exigir el rechazo de las restricciones PostgreSQL. */ () => tx(usuarios.director.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «autorizacion parcial, usuario no Director y oficina equivocada son rechazados». */  c => c.query('UPDATE documentos SET destinatario_autorizado_id=$2,oficina_destino_autorizada_id=$3,decision_autorizada_por_id=$4 WHERE id=$1', [d.id, usuarios.destino.id, usuarios.origen.oficina_id, usuarios.director.id])));
        });
        await caso('no se permite PENDIENTE_DECISION a RECIBIDO como autorizacion ni salida sin autorizar', /** Verifica el caso «no se permite PENDIENTE_DECISION a RECIBIDO como autorizacion ni salida sin autorizar»; una aserción fallida invalida este resultado. */ async () => {
            const d = await registrar(usuarios.secretaria);
            await rechaza(/** Intenta la operación inválida del caso «no se permite PENDIENTE_DECISION a RECIBIDO como autorizacion ni salida sin autorizar» para exigir el rechazo de las restricciones PostgreSQL. */ () => tx(usuarios.secretaria.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «no se permite PENDIENTE_DECISION a RECIBIDO como autorizacion ni salida sin autorizar». */  c => c.query("UPDATE documentos SET estado_tramite='RECIBIDO' WHERE id=$1", [d.id])));
            await rechaza(/** Intenta la operación inválida del caso «no se permite PENDIENTE_DECISION a RECIBIDO como autorizacion ni salida sin autorizar» para exigir el rechazo de las restricciones PostgreSQL. */ () => salir(d.id, usuarios.secretaria, usuarios.destino));
        });
        await caso('retiro de autorizacion no cambia estado ni custodia', /** Verifica el caso «retiro de autorizacion no cambia estado ni custodia»; una aserción fallida invalida este resultado. */ async () => {
            const d = await registrar(usuarios.secretaria);
            await autorizar(d, usuarios.destino);
            await tx(usuarios.director.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «retiro de autorizacion no cambia estado ni custodia». */  c => c.query('UPDATE documentos SET destinatario_autorizado_id=null,oficina_destino_autorizada_id=null,decision_autorizada_por_id=null WHERE id=$1', [d.id]));
            const r = await documento(d.id);
            assert.equal(r.estado_tramite, 'PENDIENTE_DECISION');
            assert.equal(r.responsable_actual_id, usuarios.secretaria.id);
            assert.equal(r.destinatario_autorizado_id, null);
        });
        await caso('salida atomica directa y copias historicas de autorizacion', /** Verifica el caso «salida atomica directa y copias historicas de autorizacion»; una aserción fallida invalida este resultado. */ async () => {
            const m = await salir(doc.id, usuarios.secretaria, usuarios.destino);
            doc.mov = m;
            const d = await documento(doc.id);
            assert.equal(d.estado_tramite, 'EN_TRASLADO');
            assert.equal(d.destinatario_autorizado_id, null);
            assert.equal(d.archivador_id, null);
            assert.equal(d.responsable_actual_id, usuarios.secretaria.id);
            assert.equal(m.decidido_por_id, usuarios.director.id);
        });
        await caso('movimiento sin actualizar documento no supera constraints diferidos', /** Verifica el caso «movimiento sin actualizar documento no supera constraints diferidos»; una aserción fallida invalida este resultado. */ async () => {
            const d = await registrar(usuarios.origen);
            await rechaza(/** Intenta la operación inválida del caso «movimiento sin actualizar documento no supera constraints diferidos» para exigir el rechazo de las restricciones PostgreSQL. */ () => tx(usuarios.origen.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «movimiento sin actualizar documento no supera constraints diferidos». */  c => insertarSalida(c, d, usuarios.destino)));
            assert.equal((await documento(d.id)).estado_tramite, 'RECIBIDO');
        });
        await caso('salida documental sin movimiento es rechazada', /** Verifica el caso «salida documental sin movimiento es rechazada»; una aserción fallida invalida este resultado. */ async () => {
            const d = await registrar(usuarios.origen);
            await rechaza(/** Intenta la operación inválida del caso «salida documental sin movimiento es rechazada» para exigir el rechazo de las restricciones PostgreSQL. */ () => tx(usuarios.origen.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «salida documental sin movimiento es rechazada». */  c => actualizarSalida(c, d.id)));
        });
        await caso('recepcion sin actualizar documento y custodia no puede confirmar', /** Verifica el caso «recepcion sin actualizar documento y custodia no puede confirmar»; una aserción fallida invalida este resultado. */ async () => {
            await rechaza(/** Intenta la operación inválida del caso «recepcion sin actualizar documento y custodia no puede confirmar» para exigir el rechazo de las restricciones PostgreSQL. */ () => tx(usuarios.destino.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «recepcion sin actualizar documento y custodia no puede confirmar». */  c => c.query("UPDATE movimientos_documentales SET estado='RECIBIDO',recibido_por_id=$2,fecha_recepcion=clock_timestamp() WHERE id=$1", [doc.mov.id, usuarios.destino.id])));
            assert.equal((await documento(doc.id)).estado_tramite, 'EN_TRASLADO');
        });
        await caso('solo el destinatario recibe y el archivador debe ser suyo', /** Verifica el caso «solo el destinatario recibe y el archivador debe ser suyo»; una aserción fallida invalida este resultado. */ async () => {
            await rechaza(/** Intenta la operación inválida del caso «solo el destinatario recibe y el archivador debe ser suyo» para exigir el rechazo de las restricciones PostgreSQL. */ () => recibir(doc.mov, usuarios.otro));
            await rechaza(/** Intenta la operación inválida del caso «solo el destinatario recibe y el archivador debe ser suyo» para exigir el rechazo de las restricciones PostgreSQL. */ () => recibir(doc.mov, usuarios.destino, archivo));
            await recibir(doc.mov, usuarios.destino, archivoDestino);
            const d = await documento(doc.id);
            assert.equal(d.estado_tramite, 'RECIBIDO');
            assert.equal(d.responsable_actual_id, usuarios.destino.id);
            assert.equal(d.oficina_responsable_id, usuarios.destino.oficina_id);
            assert.equal(d.archivador_id, archivoDestino);
        });
        await caso('movimiento recibido es inmutable y no puede cancelarse', /** Verifica el caso «movimiento recibido es inmutable y no puede cancelarse»; una aserción fallida invalida este resultado. */ async () => {
            await rechaza(/** Intenta la operación inválida del caso «movimiento recibido es inmutable y no puede cancelarse» para exigir el rechazo de las restricciones PostgreSQL. */ () => tx(usuarios.secretaria.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «movimiento recibido es inmutable y no puede cancelarse». */  c => c.query("UPDATE movimientos_documentales SET estado='CANCELADO' WHERE id=$1", [doc.mov.id])));
        });
        await caso('derivacion posterior fuera de Mesa de Partes conserva flujo directo', /** Verifica el caso «derivacion posterior fuera de Mesa de Partes conserva flujo directo»; una aserción fallida invalida este resultado. */ async () => {
            const m = await salir(doc.id, usuarios.destino, usuarios.origen);
            assert.equal(m.decidido_por_id, null);
            await recibir(m, usuarios.origen);
            assert.equal((await documento(doc.id)).responsable_actual_id, usuarios.origen.id);
        });
        await caso('rechazo exige motivo y conserva custodia en origen', /** Verifica el caso «rechazo exige motivo y conserva custodia en origen»; una aserción fallida invalida este resultado. */ async () => {
            const d = await registrar(usuarios.origen);
            const m = await salir(d.id, usuarios.origen, usuarios.destino);
            await rechaza(/** Intenta la operación inválida del caso «rechazo exige motivo y conserva custodia en origen» para exigir el rechazo de las restricciones PostgreSQL. */ () => rechazar(m, usuarios.destino, '   '));
            await rechazar(m, usuarios.destino);
            const r = await documento(d.id);
            assert.equal(r.estado_tramite, 'RECHAZADO');
            assert.equal(r.responsable_actual_id, usuarios.origen.id);
            doc.rechazo = { d, m };
        });
        await caso('rechazo abierto bloquea otro traslado y solo remitente recupera', /** Verifica el caso «rechazo abierto bloquea otro traslado y solo remitente recupera»; una aserción fallida invalida este resultado. */ async () => {
            await rechaza(/** Intenta la operación inválida del caso «rechazo abierto bloquea otro traslado y solo remitente recupera» para exigir el rechazo de las restricciones PostgreSQL. */ () => salir(doc.rechazo.d.id, usuarios.origen, usuarios.otro));
            await rechaza(/** Intenta la operación inválida del caso «rechazo abierto bloquea otro traslado y solo remitente recupera» para exigir el rechazo de las restricciones PostgreSQL. */ () => recuperar(doc.rechazo.m, usuarios.otro));
            await recuperar(doc.rechazo.m, usuarios.origen);
            assert.equal((await documento(doc.rechazo.d.id)).estado_tramite, 'RECIBIDO');
            const m = (await pool.query('SELECT * FROM movimientos_documentales WHERE id=$1', [doc.rechazo.m.id])).rows[0];
            assert.equal(m.estado, 'RECHAZADO');
            assert.equal(m.devolucion_confirmada_por_id, usuarios.origen.id);
        });
        await caso('rechazo recuperado queda cerrado sin agregar otro estado', /** Verifica el caso «rechazo recuperado queda cerrado sin agregar otro estado»; una aserción fallida invalida este resultado. */ async () => {
            await rechaza(/** Intenta la operación inválida del caso «rechazo recuperado queda cerrado sin agregar otro estado» para exigir el rechazo de las restricciones PostgreSQL. */ () => tx(usuarios.origen.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «rechazo recuperado queda cerrado sin agregar otro estado». */  c => c.query('UPDATE movimientos_documentales SET motivo_rechazo=$2 WHERE id=$1', [doc.rechazo.m.id, 'Alterar historia'])));
        });
        await caso('cancelacion de traslado exige recuperacion fisica y conserva documento vigente', /** Verifica el caso «cancelacion de traslado exige recuperacion fisica y conserva documento vigente»; una aserción fallida invalida este resultado. */ async () => {
            const d = await registrar(usuarios.origen);
            const m = await salir(d.id, usuarios.origen, usuarios.destino);
            await rechaza(/** Intenta la operación inválida del caso «cancelacion de traslado exige recuperacion fisica y conserva documento vigente» para exigir el rechazo de las restricciones PostgreSQL. */ () => tx(usuarios.origen.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «cancelacion de traslado exige recuperacion fisica y conserva documento vigente». */  c => c.query("UPDATE movimientos_documentales SET estado='CANCELADO',cancelado_por_id=$2,fecha_cancelacion=clock_timestamp(),motivo_cancelacion='QA' WHERE id=$1", [m.id, usuarios.origen.id])));
            await tx(usuarios.origen.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «cancelacion de traslado exige recuperacion fisica y conserva documento vigente». */ async (c) => {
                await c.query("WITH instante AS (SELECT clock_timestamp() t) UPDATE movimientos_documentales SET estado='CANCELADO',cancelado_por_id=$2,fecha_cancelacion=t,motivo_cancelacion='QA',devolucion_confirmada_por_id=$2,fecha_confirmacion_devolucion=t FROM instante WHERE id=$1", [m.id, usuarios.origen.id]);
                await c.query("UPDATE documentos SET estado_tramite='RECIBIDO' WHERE id=$1", [d.id]);
            });
            const r = await documento(d.id);
            assert.equal(r.activo, true);
            assert.equal(r.estado_tramite, 'RECIBIDO');
        });
        await caso('correccion exige motivo, conserva codigo y crea historial; anulacion es logica', /** Verifica el caso «correccion exige motivo, conserva codigo y crea historial; anulacion es logica»; una aserción fallida invalida este resultado. */ async () => {
            const d = await registrar(usuarios.origen);
            await rechaza(/** Intenta la operación inválida del caso «correccion exige motivo, conserva codigo y crea historial; anulacion es logica» para exigir el rechazo de las restricciones PostgreSQL. */ () => tx(usuarios.origen.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «correccion exige motivo, conserva codigo y crea historial; anulacion es logica». */  c => c.query('UPDATE documentos SET asunto=$2 WHERE id=$1', [d.id, 'Sin motivo']), ''));
            await tx(usuarios.origen.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «correccion exige motivo, conserva codigo y crea historial; anulacion es logica». */  c => c.query('UPDATE documentos SET asunto=$2 WHERE id=$1', [d.id, 'Corregido QA']));
            assert.equal((await documento(d.id)).codigo, d.codigo);
            await rechaza(/** Intenta la operación inválida del caso «correccion exige motivo, conserva codigo y crea historial; anulacion es logica» para exigir el rechazo de las restricciones PostgreSQL. */ () => tx(usuarios.origen.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «correccion exige motivo, conserva codigo y crea historial; anulacion es logica». */  c => c.query('UPDATE documentos SET codigo=$2 WHERE id=$1', [d.id, 'MANUAL'])));
            await tx(usuarios.origen.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «correccion exige motivo, conserva codigo y crea historial; anulacion es logica». */  c => c.query("UPDATE documentos SET activo=false,estado_tramite='CANCELADO' WHERE id=$1", [d.id]));
            assert.equal((await documento(d.id)).activo, false);
            await rechaza(/** Intenta la operación inválida del caso «correccion exige motivo, conserva codigo y crea historial; anulacion es logica» para exigir el rechazo de las restricciones PostgreSQL. */ () => tx(usuarios.origen.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «correccion exige motivo, conserva codigo y crea historial; anulacion es logica». */  c => c.query('UPDATE documentos SET asunto=$2 WHERE id=$1', [d.id, 'Cambiar anulado'])));
        });
        await caso('fechas imposibles y fechas incompletas son rechazadas', /** Verifica el caso «fechas imposibles y fechas incompletas son rechazadas»; una aserción fallida invalida este resultado. */ async () => {
            const d = await registrar(usuarios.origen);
            await rechaza(/** Intenta la operación inválida del caso «fechas imposibles y fechas incompletas son rechazadas» para exigir el rechazo de las restricciones PostgreSQL. */ () => tx(usuarios.origen.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «fechas imposibles y fechas incompletas son rechazadas». */  c => insertarSalida(c, d, usuarios.destino, { fecha: 'infinity' })));
            const m = await salir(d.id, usuarios.origen, usuarios.destino);
            await rechaza(/** Intenta la operación inválida del caso «fechas imposibles y fechas incompletas son rechazadas» para exigir el rechazo de las restricciones PostgreSQL. */ () => tx(usuarios.destino.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «fechas imposibles y fechas incompletas son rechazadas». */  c => c.query("UPDATE movimientos_documentales SET estado='RECIBIDO',recibido_por_id=$2,fecha_recepcion='2000-01-01' WHERE id=$1", [m.id, usuarios.destino.id])));
            await rechaza(/** Intenta la operación inválida del caso «fechas imposibles y fechas incompletas son rechazadas» para exigir el rechazo de las restricciones PostgreSQL. */ () => tx(usuarios.destino.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «fechas imposibles y fechas incompletas son rechazadas». */  c => c.query("UPDATE movimientos_documentales SET estado='RECIBIDO',recibido_por_id=$2 WHERE id=$1", [m.id, usuarios.destino.id])));
            await recibir(m, usuarios.destino);
        });
        await caso('cambio de oficina despues de autorizar bloquea salida sin alterar destino historico', /** Verifica el caso «cambio de oficina despues de autorizar bloquea salida sin alterar destino historico»; una aserción fallida invalida este resultado. */ async () => {
            const d = await registrar(usuarios.secretaria);
            await autorizar(d, usuarios.otro);
            await pool.query('UPDATE usuarios SET oficina_id=$2 WHERE id=$1', [usuarios.otro.id, usuarios.origen.oficina_id]);
            try {
                await rechaza(/** Intenta la operación inválida del caso «cambio de oficina despues de autorizar bloquea salida sin alterar destino historico» para exigir el rechazo de las restricciones PostgreSQL. */ () => salir(d.id, usuarios.secretaria, usuarios.otro));
            }
            finally {
                await pool.query('UPDATE usuarios SET oficina_id=$2 WHERE id=$1', [usuarios.otro.id, usuarios.otro.oficina_id]);
            }
            assert.equal((await documento(d.id)).oficina_destino_autorizada_id, usuarios.otro.oficina_id);
        });
        await caso('recepcion rechaza cuenta trasladada de oficina despues de la salida', /** Verifica el caso «recepcion rechaza cuenta trasladada de oficina despues de la salida»; una aserción fallida invalida este resultado. */ async () => {
            const d = await registrar(usuarios.origen);
            const m = await salir(d.id, usuarios.origen, usuarios.otro);
            await pool.query('UPDATE usuarios SET oficina_id=$2 WHERE id=$1', [usuarios.otro.id, usuarios.origen.oficina_id]);
            try {
                await rechaza(/** Intenta la operación inválida del caso «recepcion rechaza cuenta trasladada de oficina despues de la salida» para exigir el rechazo de las restricciones PostgreSQL. */ () => recibir(m, usuarios.otro));
            }
            finally {
                await pool.query('UPDATE usuarios SET oficina_id=$2 WHERE id=$1', [usuarios.otro.id, usuarios.otro.oficina_id]);
            }
        });
        await caso('salida no puede tener una fecha anterior a la autorizacion', /** Verifica el caso «salida no puede tener una fecha anterior a la autorizacion»; una aserción fallida invalida este resultado. */ async () => {
            const d = await registrar(usuarios.secretaria);
            await autorizar(d, usuarios.destino);
            await rechaza(/** Intenta la operación inválida del caso «salida no puede tener una fecha anterior a la autorizacion» para exigir el rechazo de las restricciones PostgreSQL. */ () => tx(usuarios.secretaria.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «salida no puede tener una fecha anterior a la autorizacion». */ async (c) => {
                const actual = (await c.query('SELECT * FROM documentos WHERE id=$1 FOR UPDATE', [d.id])).rows[0];
                const anterior = (await c.query("SELECT (fecha_creacion+interval '1 microsecond')::text fecha FROM documentos WHERE id=$1", [d.id])).rows[0].fecha;
                await insertarSalida(c, actual, usuarios.destino, { fecha: anterior });
                await actualizarSalida(c, d.id);
            }));
        });
        await caso('concurrencia real de correlativos: 12 conexiones, codigos unicos y consecutivos', /** Verifica el caso «concurrencia real de correlativos: 12 conexiones, codigos unicos y consecutivos»; una aserción fallida invalida este resultado. */ async () => {
            const clientes = await Promise.all(Array.from({ length: 12 }, /** Adquiere una conexión QA independiente para cada participante de la prueba de concurrencia real. */ () => pool.connect()));
            try {
                const pids = await Promise.all(clientes.map(/** Obtiene o compara el identificador del fixture para verificar asociaciones sin perder la precisión bigint. */ c => c.query('SELECT pg_backend_pid() pid')));
                assert.equal(new Set(pids.map(/** Obtiene o compara el identificador del fixture para verificar asociaciones sin perder la precisión bigint. */ r => r.rows[0].pid)).size, 12);
                const filas = await Promise.all(clientes.map(/** Extrae del resultado de la operación los valores que contrastan las aserciones del escenario QA. */ (c, i) => registrar(usuarios.origen, 'Concurrente ' + i, c)));
                assert.equal(new Set(filas.map(/** Extrae del resultado de la operación los valores que contrastan las aserciones del escenario QA. */ d => d.codigo)).size, 12);
                const numeros = filas.map(/** Extrae del resultado de la operación los valores que contrastan las aserciones del escenario QA. */ d => Number(d.codigo.slice(7))).sort(/** Ordena las mediciones de mayor a menor tamaño para presentar la contribución al bundle. */ (a, b) => a - b);
                assert.equal(numeros.at(-1) - numeros[0], 11);
            }
            finally {
                clientes.forEach(/** Comprueba o registra cada entrada del conjunto preparado por el escenario de pruebas. */  c => c.release());
            }
        });
        await caso('dos salidas concurrentes: exactamente una confirma y no hay duplicados', /** Verifica el caso «dos salidas concurrentes: exactamente una confirma y no hay duplicados»; una aserción fallida invalida este resultado. */ async () => {
            const d = await registrar(usuarios.origen);
            const r = await Promise.allSettled([salir(d.id, usuarios.origen, usuarios.destino), salir(d.id, usuarios.origen, usuarios.otro)]);
            assert.equal(r.filter(/** Extrae del resultado de la operación los valores que contrastan las aserciones del escenario QA. */ v => v.status === 'fulfilled').length, 1);
            assert.equal((await pool.query("SELECT count(*)::int n FROM movimientos_documentales WHERE documento_id=$1 AND estado='EN_TRASLADO'", [d.id])).rows[0].n, 1);
        });
        await caso('indice unico parcial rechaza dos movimientos abiertos dentro de una transaccion', /** Verifica el caso «indice unico parcial rechaza dos movimientos abiertos dentro de una transaccion»; una aserción fallida invalida este resultado. */ async () => {
            const d = await registrar(usuarios.origen);
            await rechaza(/** Intenta la operación inválida del caso «indice unico parcial rechaza dos movimientos abiertos dentro de una transaccion» para exigir el rechazo de las restricciones PostgreSQL. */ () => tx(usuarios.origen.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «indice unico parcial rechaza dos movimientos abiertos dentro de una transaccion». */ async (c) => {
                await insertarSalida(c, d, usuarios.destino);
                await insertarSalida(c, d, usuarios.otro);
            }), '23505');
        });
        await caso('el bloqueo de destinatario impide cambiar oficina mientras se autoriza', /** Verifica el caso «el bloqueo de destinatario impide cambiar oficina mientras se autoriza»; una aserción fallida invalida este resultado. */ async () => {
            const d = await registrar(usuarios.secretaria);
            const a = await pool.connect();
            const b = await pool.connect();
            try {
                await a.query('BEGIN');
                await a.query("SELECT set_config('app.usuario_actor_id',$1,true),set_config('app.motivo_documental','QA bloqueo',true)", [usuarios.director.id]);
                await a.query('UPDATE documentos SET destinatario_autorizado_id=$2,oficina_destino_autorizada_id=$3,decision_autorizada_por_id=$4 WHERE id=$1', [d.id, usuarios.otro.id, usuarios.otro.oficina_id, usuarios.director.id]);
                await b.query('BEGIN');
                await b.query("SET LOCAL lock_timeout='150ms'");
                await assert.rejects(/** Ejecuta la operación del caso «el bloqueo de destinatario impide cambiar oficina mientras se autoriza» para comprobar su rechazo o excepción esperada. */ () => b.query('UPDATE usuarios SET oficina_id=$2 WHERE id=$1', [usuarios.otro.id, usuarios.origen.oficina_id]), /** Comprueba que el error capturado coincida con el estado o código esperado por el caso. */  e => e.code === '55P03');
            }
            finally {
                await b.query('ROLLBACK');
                await a.query('ROLLBACK');
                a.release();
                b.release();
            }
        });
        await caso('sin prefijo no se registra SiseVe por el generador ordinario; no hay borrado fisico', /** Verifica el caso «sin prefijo no se registra SiseVe por el generador ordinario; no hay borrado fisico»; una aserción fallida invalida este resultado. */ async () => {
            if ((await pool.query('SELECT prefijo_codigo FROM tipos_documentales WHERE id=$1', [tipos['SíseVe'].id])).rows[0].prefijo_codigo === null)
                await rechaza(/** Intenta la operación inválida del caso «sin prefijo no se registra SiseVe por el generador ordinario; no hay borrado fisico» para exigir el rechazo de las restricciones PostgreSQL. */ () => tx(usuarios.origen.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «sin prefijo no se registra SiseVe por el generador ordinario; no hay borrado fisico». */  c => c.query("INSERT INTO documentos(tipo_documental_id,asunto,registrado_por_id,responsable_actual_id,oficina_responsable_id,estado_tramite) VALUES($1,'QA',$2,$2,$3,'RECIBIDO')", [tipos['SíseVe'].id, usuarios.origen.id, usuarios.origen.oficina_id])));
            await rechaza(/** Intenta la operación inválida del caso «sin prefijo no se registra SiseVe por el generador ordinario; no hay borrado fisico» para exigir el rechazo de las restricciones PostgreSQL. */ () => tx(usuarios.origen.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «sin prefijo no se registra SiseVe por el generador ordinario; no hay borrado fisico». */  c => c.query('DELETE FROM documentos WHERE id=$1', [doc.id])));
            await rechaza(/** Intenta la operación inválida del caso «sin prefijo no se registra SiseVe por el generador ordinario; no hay borrado fisico» para exigir el rechazo de las restricciones PostgreSQL. */ () => tx(usuarios.origen.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «sin prefijo no se registra SiseVe por el generador ordinario; no hay borrado fisico». */  c => c.query('DELETE FROM movimientos_documentales WHERE id=$1', [doc.mov.id])));
        });
        await caso('compatibilidad real con login, consultas actuales de Express y contratos de React', /** Verifica el caso «compatibilidad real con login, consultas actuales de Express y contratos de React»; una aserción fallida invalida este resultado. */ async () => {
            process.env.DATABASE_URL = qa.connectionString;
            if (!process.env.QA_HTTP_BASE) process.env.JWT_SECRET = 'solo-qa-' + randomUUID();
            const { app } = await import('../dist/app.js');
            appPool = (await import('../dist/config/database.js')).pool;
            const { listaDocumentosSchema } = await import('../../frontend/src/features/documentos/schemas/documentos.schema.ts');
            const { listaMovimientosSchema } = await import('../../frontend/src/features/movimientos/schemas/movimientos.schema.ts');
            if (process.env.QA_HTTP_BASE) {
                base = process.env.QA_HTTP_BASE;
            } else {
                servidor = app.listen(0, '127.0.0.1');
                await new Promise(r => servidor.once('listening', r));
                base = `http://127.0.0.1:${servidor.address().port}`;
            }
            const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identificador: 'qa_origen' + (process.env.QA_FIXTURE_SUFFIX ?? ''), contrasena: 'Prueba-aislada-2026!' }) });
            assert.equal(login.status, 200);
            const { token } = await login.json();
            const headers = { Authorization: `Bearer ${token}` };
            assert.equal((await fetch(base + '/api/auth/me', { headers })).status, 200);
            const docs = await fetch(base + '/api/documentos', { headers });
            assert.equal(docs.status, 200);
            assert.equal(listaDocumentosSchema.safeParse(await docs.json()).success, true);
            const mov = await fetch(base + '/api/movimientos', { headers });
            assert.equal(mov.status, 200);
            assert.equal(listaMovimientosSchema.safeParse(await mov.json()).success, true);
            assert.equal((await fetch(base + '/api/usuarios', { headers })).status, 403);
        });
        await caso('regresiones de catalogos administrativos y ubicaciones sobre esquema migrado', /** Verifica el caso «regresiones de catalogos administrativos y ubicaciones sobre esquema migrado»; una aserción fallida invalida este resultado. */ async () => {
            /** Envía o simula el login del escenario de pruebas según el adaptador local; no utiliza cuentas institucionales reales. */
            const login = async (identificador) => {
                const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identificador, contrasena: 'Prueba-aislada-2026!' }) });
                assert.equal(r.status, 200);
                return (await r.json()).token;
            };
            tokenAdmin = await login('qa_admin' + (process.env.QA_FIXTURE_SUFFIX ?? ''));
            tokenDirector = await login('qa_director' + (process.env.QA_FIXTURE_SUFFIX ?? ''));
            for (const ruta of ['/api/roles', '/api/oficinas', '/api/usuarios', '/api/tipos-documentales', '/api/ubicaciones/estantes', '/api/ubicaciones/archivadores'])
                assert.equal((await fetch(base + ruta, { headers: { Authorization: `Bearer ${tokenAdmin}` } })).status, 200);
            const docs = await (await fetch(base + '/api/documentos', { headers: { Authorization: `Bearer ${tokenDirector}` } })).json();
            assert.ok(docs.total > 0);
        });
        await caso('Operaciones HTTP completas React-Express-PostgreSQL en QA', /** Verifica el caso «Operaciones HTTP completas React-Express-PostgreSQL en QA»; una aserción fallida invalida este resultado. */ async () => {
            const { probarOperaciones } = await import('./documental-http-casos.mjs');
            await probarOperaciones({ base, usuarios, tipos, archivo, archivoDestino, tokenDirector, tokenAdmin, pool });
        });
        await caso('endpoints generales ocultan contenido y movimientos de tipos restringidos', /** Verifica el caso «endpoints generales ocultan contenido y movimientos de tipos restringidos»; una aserción fallida invalida este resultado. */ async () => {
            // Marca de confidencialidad SOLO en la copia QA; no se crea un tipo ficticio ni se toca el catalogo institucional.
            await tx(usuarios.admin.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «endpoints generales ocultan contenido y movimientos de tipos restringidos». */  c => c.query('UPDATE tipos_documentales SET requiere_clave=true WHERE id=$1', [tipos.Informe.id]));
            try {
                for (const token of [tokenDirector, tokenAdmin]) {
                    const headers = { Authorization: `Bearer ${token}` };
                    // QA persistente puede contener otros tipos; el tipo restringido debe desaparecer incluso de su contador filtrado.
                    const lista = await (await fetch(base + `/api/documentos?tipo_documental_id=${tipos.Informe.id}`, { headers })).json();
                    assert.equal(lista.total, 0);
                    assert.deepEqual(lista.documentos, []);
                    for (const ruta of [`/api/documentos/${doc.id}`, `/api/documentos/${doc.id}/historial`, `/api/movimientos/${doc.mov.id}`])
                        assert.equal((await fetch(base + ruta, { headers })).status, 404);
                    const movimientos = await (await fetch(base + `/api/movimientos?documento_id=${doc.id}`, { headers })).json();
                    assert.equal(movimientos.total, 0);
                    assert.deepEqual(movimientos.movimientos, []);
                }
            }
            finally {
                await tx(usuarios.admin.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA para comprobar «endpoints generales ocultan contenido y movimientos de tipos restringidos». */  c => c.query('UPDATE tipos_documentales SET requiere_clave=false WHERE id=$1', [tipos.Informe.id]));
            }
        });
        await caso('Regresion SQL y HTTP de administracion, catalogos y consultas en ROLLBACK dentro de QA', /** Verifica el caso «Regresion SQL y HTTP de administracion, catalogos y consultas en ROLLBACK dentro de QA»; una aserción fallida invalida este resultado. */ async () => {
            for (const archivo of ['admin.integration.mjs', 'catalogos.integration.mjs', 'documentos.consultas.integration.mjs']) {
                const r = spawnSync(process.execPath, ['--test', `tests/${archivo}`], { env: { ...process.env, NODE_TEST_CONTEXT: undefined, DATABASE_URL: qa.connectionString, DB_QA_AUTORIZADA: qa.nombre, ADMIN_WRITE_TESTS: 'ROLLBACK_AUTHORIZED' }, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
                assert.equal(r.status, 0, r.stdout + '\n' + r.stderr);
                const cantidad = Number(r.stdout.match(/tests\s+(\d+)/)?.[1]);
                assert.ok(cantidad > 1, r.stdout + '\n' + r.stderr);
                assert.match(r.stdout, /ROLLBACK verificado/);
                regresiones.push({ archivo, pruebas: cantidad, resultado: 'aprobado' });
                console.log(`Regresion aislada ${archivo}: ${cantidad} pruebas aprobadas con ROLLBACK.`);
            }
        });
        if (process.env.QA_VISUAL_DOCUMENTAL === 'SI') {
            const { iniciarVisual } = await import('./documental-visual.mjs');
            await iniciarVisual(base, /** Registra un documento efímero en QA para la revisión visual del circuito documental. */ () => registrar(usuarios.secretaria, 'Documento para verificacion visual'));
        }
    }
    finally {
        if (servidor)
            await new Promise(/** Enlaza la finalización asíncrona del recurso o respuesta controlada con la promesa que espera la prueba. */  r => servidor.close(r));
        if (appPool)
            await appPool.end();
        process.env.DATABASE_URL = qa.original;
        await qa.limpiar();
        console.log(process.env.NEON_QA_TESTS === '1' ? 'Rama Neon QA conservada; fixtures solo en QA.' : 'Base QA eliminada; estructura y datos institucionales comparados e intactos.');
    }
    if (process.env.NEON_QA_TESTS === '1') {
        await writeFile('../.private/render/RESULTADOS_NEON_DOCUMENTAL.json', JSON.stringify({ runtime: 'Node.js y Express con Neon QA directo', casos_aprobados: resultados, regresiones, rama_conservada: true, ddl_ejecutado: false, principal_conectado: false }, null, 2));
        return;
    }
    await writeFile('../docs/RESULTADOS_INTEGRACION_DOCUMENTAL.json', JSON.stringify({ fecha: '2026-10-21', sql_sha256: qa.sha256, casos_aprobados: resultados, regresiones, ddl_institucional: 'Permanente autorizado; ninguna escritura institucional durante QA', base_temporal_eliminada: true, estructura_y_datos_institucionales_intactos: true, concurrencia: 'Doce sesiones PostgreSQL independientes en base temporal sin datos personales' }, null, 2) + '\n');
});
