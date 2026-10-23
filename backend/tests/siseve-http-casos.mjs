import assert from 'node:assert/strict';
/** Operaciones reales exclusivamente en la copia QA creada por el verificador documental. */
export async function probarSiseve({ base, tokens, usuarios, tipos, archivo, archivoDestino, pool, tx }) {
    const sinJwt = await fetch(base + '/api/siseve/operaciones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(sinJwt.status, 401);
    assert.match(sinJwt.headers.get('cache-control'), /no-store/);
    const clave = 'Clave-Siseve-QA-2026!';
    const nueva = 'Nueva-Siseve-QA-2026!';
    /** Envía una petición QA, comprueba el estado esperado y devuelve su respuesta para el caso de SíseVe. */
    const llamada = async (actor, ruta, datos, status = 200, method = 'POST') => {
        const r = await fetch(base + ruta, { method, headers: { Authorization: `Bearer ${tokens[actor]}`, 'Content-Type': 'application/json' }, ...(datos === undefined ? {} : { body: JSON.stringify(datos) }) });
        const json = await r.json();
        assert.equal(r.status, status, `${ruta}: ${JSON.stringify(json)}`);
        return json;
    };
    /** Ejecuta una operación restringida QA con la clave y actor del caso y extrae su resultado autorizado. */
    const op = async (actor, operacion, datos = {}, id, contrasena = clave, status = 200) => (await llamada(actor, '/api/siseve/operaciones', { operacion, datos, ...(id ? { id } : {}), clave: contrasena }, status)).resultado;
    await tx(usuarios.admin.id, /** Ejecuta las escrituras del fixture dentro de la transacción QA, conservando actor y motivo de auditoría. */  c => c.query("UPDATE tipos_documentales SET prefijo_codigo='SISEVE' WHERE id=$1", [tipos['SíseVe'].id]));
    await llamada('origen', '/api/siseve/administracion', undefined, 403, 'GET');
    await llamada('admin', '/api/siseve/clave', { contrasena: clave }, 200, 'PUT');
    let configuracion = await llamada('admin', '/api/siseve/administracion', undefined, 200, 'GET');
    assert.equal(configuracion.configuracion.clave_configurada, true);
    assert.equal(JSON.stringify(configuracion).includes('scrypt$'), false);
    assert.equal(JSON.stringify(configuracion).includes(clave), false);
    await op('origen', 'listar', {}, undefined, clave, 403);
    for (const nombre of ['origen', 'destino', 'secretaria', 'director'])
        await llamada('admin', '/api/siseve/autorizaciones', { usuario_id: usuarios[nombre].id, activo: true }, 200, 'PUT');
    await op('origen', 'listar', {}, undefined, 'Incorrecta-QA', 403);
    const tipoPublicoAntes = (await llamada('admin', `/api/tipos-documentales/${tipos['SíseVe'].id}`, undefined, 200, 'GET')).tipo;
    assert.equal(tipoPublicoAntes.prefijo_protegido, true);
    await op('origen', 'registrar', { tipo_documental_id: tipos.Informe.id, asunto: 'No mezclar ambitos', remitente: null, observaciones: null, archivador_id: null }, undefined, clave, 400);
    let { documento: d } = await op('origen', 'registrar', { tipo_documental_id: tipos['SíseVe'].id, asunto: 'Asunto confidencial QA unico', remitente: 'Remitente protegido QA', observaciones: 'Observacion reservada QA', archivador_id: null });
    assert.match(d.codigo, /^SISEVE[0-9]+$/);
    assert.deepEqual((await llamada('admin', `/api/tipos-documentales/${tipos['SíseVe'].id}`, undefined, 200, 'GET')).tipo, tipoPublicoAntes);
    const did = d.id;
    for (const actor of ['admin', 'director', 'origen']) {
        const generales = await llamada(actor, '/api/documentos?q=Asunto%20confidencial%20QA', undefined, 200, 'GET');
        assert.equal(generales.total, 0);
        for (const ruta of [`/api/documentos/${did}`, `/api/documentos/${did}/historial`])
            await llamada(actor, ruta, undefined, 404, 'GET');
    }
    await op('admin', 'detalle', {}, did, clave, 403);
    await op('destino', 'detalle', {}, did, clave, 404);
    await op('director', 'detalle', {}, did);
    let { documento: corregido } = await op('origen', 'corregir', { asunto: 'Correccion reservada QA', remitente: null, observaciones: 'Se conserva privado', motivo: 'Motivo confidencial QA' }, did);
    assert.equal(corregido.codigo, d.codigo);
    const historial = await op('origen', 'historial', {}, did);
    assert.ok(historial.historial.length > 1);
    assert.equal(JSON.stringify(historial).includes('Motivo confidencial QA'), false);
    await llamada('admin', '/api/siseve/autorizaciones', { usuario_id: usuarios.origen.id, activo: false }, 200, 'PUT');
    await op('origen', 'detalle', {}, did, clave, 403);
    await llamada('admin', '/api/siseve/autorizaciones', { usuario_id: usuarios.origen.id, activo: true }, 200, 'PUT');
    await llamada('admin', '/api/siseve/clave', { contrasena: clave }, 409, 'PUT');
    await llamada('admin', '/api/siseve/clave', { contrasena: nueva }, 200, 'PUT');
    await op('origen', 'detalle', {}, did, clave, 403);
    await op('origen', 'detalle', {}, did, nueva);
    /** Ejecuta una operación restringida QA con la clave rotada para comprobar que la anterior deja de servir. */
    const operar = (actor, operacion, datos = {}, id, status = 200) => op(actor, operacion, datos, id, nueva, status);
    let { movimiento: m } = await operar('origen', 'salir', { documento_id: did, usuario_destino_id: usuarios.destino.id, motivo: 'Salida reservada QA' });
    await llamada('director', `/api/movimientos/${m.id}`, undefined, 404, 'GET');
    const recorridoGeneral = await llamada('origen', `/api/movimientos?documento_id=${did}`, undefined, 200, 'GET');
    assert.equal(recorridoGeneral.total, 0);
    await operar('director', 'recibir', { archivador_id: null }, m.id, 403);
    await operar('destino', 'recibir', { archivador_id: archivoDestino }, m.id);
    d = (await operar('destino', 'detalle', {}, did)).documento;
    assert.equal(d.responsable_actual_id, usuarios.destino.id);
    assert.equal(d.archivador_id, archivoDestino);
    m = (await operar('destino', 'salir', { documento_id: did, usuario_destino_id: usuarios.secretaria.id, motivo: 'Remision a Mesa QA' })).movimiento;
    await operar('secretaria', 'recibir', { archivador_id: archivo }, m.id);
    await operar('secretaria', 'solicitar-decision', { motivo: 'Decision institucional QA' }, did);
    d = (await operar('director', 'autorizar', { usuario_destino_id: usuarios.origen.id, motivo: 'Autorizacion restringida QA' }, did)).documento;
    assert.equal(d.estado_tramite, 'PENDIENTE_DECISION');
    m = (await operar('secretaria', 'salir', { documento_id: did, usuario_destino_id: usuarios.origen.id, motivo: 'Salida autorizada QA' })).movimiento;
    await operar('origen', 'rechazar', { motivo: 'Rechazo reservado QA' }, m.id);
    await operar('secretaria', 'recuperar', { motivo: 'Recuperacion QA', archivador_id: archivo, confirmar_recuperacion: true }, m.id);
    await operar('secretaria', 'solicitar-decision', { motivo: 'Nueva decision QA' }, did);
    await operar('director', 'autorizar', { usuario_destino_id: usuarios.origen.id, motivo: 'Decision para cancelacion QA' }, did);
    m = (await operar('secretaria', 'salir', { documento_id: did, usuario_destino_id: usuarios.origen.id, motivo: 'Salida a cancelar QA' })).movimiento;
    await operar('secretaria', 'cancelar', { archivador_id: archivo, motivo: 'Original recuperado QA', confirmar_recuperacion: true }, m.id);
    await operar('secretaria', 'anular', { motivo: 'Anulacion reservada QA' }, did);
    const generalOpciones = await llamada('director', '/api/documentos/opciones', undefined, 200, 'GET');
    assert.ok(!generalOpciones.tipos.some(/** Selecciona las entradas de generalOpciones.tipos que cumplen el criterio requerido por la comprobación. */ /** Obtiene o compara el identificador del fixture para verificar asociaciones sin perder la precisión bigint. */ t => t.id === tipos['SíseVe'].id));
    const auditoria = (await pool.query("SELECT campos_modificados FROM historial_modificaciones WHERE tabla IN ('claves_tipos_documentales','autorizaciones_tipos_restringidos')")).rows;
    assert.ok(auditoria.length);
    assert.equal(JSON.stringify(auditoria).includes('scrypt$'), false);
    assert.equal(JSON.stringify(auditoria).includes(clave), false);
    assert.equal(JSON.stringify(auditoria).includes(nueva), false);
    // No se devuelve ningun contenido si falta la clave, incluso habiendo completado una operacion anterior.
    await llamada('origen', '/api/siseve/operaciones', { operacion: 'detalle', id: did, datos: {} }, 400);
    // La consulta de ubicaciones describe catalogos fisicos, nunca documentos asociados ni sus totales.
    const ubicaciones = await llamada('admin', '/api/ubicaciones/archivadores', undefined, 200, 'GET');
    assert.equal(JSON.stringify(ubicaciones).includes('Correccion reservada QA'), false);
    assert.equal(JSON.stringify(ubicaciones).includes('documento_id'), false);
    for (let intento = 0; intento < 10; intento++)
        await op('otro', 'listar', {}, undefined, 'Incorrecta-QA', 403);
    await op('otro', 'listar', {}, undefined, 'Incorrecta-QA', 429);
    // Una cuenta bloqueada no bloquea a otra que comparte la misma direccion IP de QA.
    await operar('director', 'listar');
    return { comprobaciones: ['Concesion y revocacion individuales', 'Denegacion sin autorizacion individual y sin privilegio automatico de Administrador', 'Denegacion con clave incorrecta y sin clave', 'Registro y codigo SISEVE usando generador existente', 'Edicion con motivo y auditoria protegida', 'Rotacion distinta e invalidacion inmediata de clave anterior', 'Exclusion general de documentos, conteos, filtros, movimientos y ubicaciones asociadas', 'Catalogo de tipos sin inferencia de existencia por prefijo_protegido', 'Permisos ordinarios de lectura, custodia y recepcion', 'Derivacion, recepcion y circuito Direccion/Mesa de Partes', 'Rechazo, recuperacion, cancelacion y anulacion logica', 'Ausencia de claves o hashes en respuestas y auditoria', 'Limite por cuenta y aislamiento de usuarios de una misma IP'] };
}
