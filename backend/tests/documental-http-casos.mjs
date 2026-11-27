import assert from 'node:assert/strict';
/** Flujos HTTP reales sobre la copia efimera; ninguna escritura usa la base institucional. */
export async function probarOperaciones({ base, usuarios, tipos, archivo, archivoDestino, tokenDirector, tokenAdmin, pool }) {
    const tokens = { director: tokenDirector, admin: tokenAdmin };
    for (const nombre of ['secretaria', 'origen', 'destino', 'otro']) {
        const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identificador: 'qa_' + nombre + (process.env.QA_FIXTURE_SUFFIX ?? ''), contrasena: 'Prueba-aislada-2026!' }) });
        assert.equal(r.status, 200);
        tokens[nombre] = (await r.json()).token;
    }
    /** Envía una petición al servidor local de pruebas con el contrato y las credenciales efímeras del escenario. */
    const request = async (actor, ruta, datos, status = 200, metodo = 'POST') => {
        const r = await fetch(base + ruta, { method: metodo, headers: { Authorization: `Bearer ${tokens[actor]}`, 'Content-Type': 'application/json' }, ...(datos === undefined ? {} : { body: JSON.stringify(datos) }) });
        const json = await r.json();
        assert.equal(r.status, status, `${ruta}: ${JSON.stringify(json)}`);
        return json;
    };
    const contenido = { tipo_documental_id: tipos.Informe.id, asunto: 'Integracion HTTP QA', remitente: null, observaciones: null, archivador_id: archivo };
    let { documento: d } = await request('secretaria', '/api/documentos', contenido, 201);
    const { detalleDocumentoSchema, opcionesSchema } = await import('../../frontend/src/features/documentos/schemas/documentos.schema.ts');
    assert.ok(detalleDocumentoSchema.safeParse({ documento: d }).success);
    assert.equal(d.estado_tramite, 'PENDIENTE_DECISION');
    assert.ok(opcionesSchema.safeParse(await request('secretaria', '/api/documentos/opciones', undefined, 200, 'GET')).success);
    await request('admin', `/api/documentos/${d.id}`, undefined, 404, 'GET');
    await request('otro', `/api/documentos/${d.id}/autorizar`, { usuario_destino_id: usuarios.destino.id, motivo: 'QA' }, 404);
    await request('secretaria', `/api/documentos/${d.id}`, { asunto: 'Correccion HTTP', remitente: null, observaciones: 'Nota', motivo: 'Correccion QA' }, 200, 'PUT');
    await request('secretaria', `/api/documentos/${d.id}`, { asunto: 'Sin motivo', remitente: null, observaciones: null, motivo: '' }, 400, 'PUT');
    let r = await request('director', `/api/documentos/${d.id}/autorizar`, { usuario_destino_id: usuarios.destino.id, motivo: 'Decision QA' });
    assert.equal(r.documento.estado_tramite, 'PENDIENTE_DECISION');
    assert.equal((await pool.query('SELECT count(*)::int n FROM movimientos_documentales WHERE documento_id=$1', [d.id])).rows[0].n, 0);
    await request('director', `/api/documentos/${d.id}/retirar-autorizacion`, { motivo: 'Revisar decision QA' });
    await request('secretaria', '/api/movimientos', { documento_id: d.id, usuario_destino_id: usuarios.destino.id, motivo: 'Salida sin decision' }, 409);
    await request('director', `/api/documentos/${d.id}/autorizar`, { usuario_destino_id: usuarios.destino.id, motivo: 'Decision definitiva QA' });
    let { movimiento: m } = await request('secretaria', '/api/movimientos', { documento_id: d.id, usuario_destino_id: usuarios.destino.id, motivo: 'Salida fisica QA' }, 201);
    await request('secretaria', '/api/movimientos', { documento_id: d.id, usuario_destino_id: usuarios.destino.id, motivo: 'Salida duplicada' }, 409);
    const entrada = await request('destino', '/api/movimientos?bandeja=entrada', undefined, 200, 'GET');
    assert.ok(entrada.movimientos.some(/** Obtiene o compara el identificador del fixture para verificar asociaciones sin perder la precisión bigint. */ f => f.id === m.id));
    assert.ok(entrada.movimientos.every(/** Exige que todas las filas cumplan el alcance del escenario. */  f => f.usuario_destino_id === usuarios.destino.id && f.estado === 'EN_TRASLADO'));
    await request('otro', `/api/movimientos/${m.id}/recibir`, { archivador_id: null }, 404);
    await request('destino', `/api/movimientos/${m.id}/recibir`, { archivador_id: archivo }, 400);
    await request('destino', `/api/movimientos/${m.id}/recibir`, { archivador_id: archivoDestino });
    d = (await request('destino', `/api/documentos/${d.id}`, undefined, 200, 'GET')).documento;
    assert.equal(d.responsable_actual_id, usuarios.destino.id);
    assert.equal(d.archivador_id, archivoDestino);
    await request('secretaria', `/api/movimientos/${m.id}/cancelar`, { archivador_id: null, motivo: 'QA', confirmar_recuperacion: true }, 409);
    m = (await request('destino', '/api/movimientos', { documento_id: d.id, usuario_destino_id: usuarios.origen.id, motivo: 'Derivacion posterior' }, 201)).movimiento;
    await request('origen', `/api/movimientos/${m.id}/rechazar`, { motivo: '' }, 400);
    await request('origen', `/api/movimientos/${m.id}/rechazar`, { motivo: 'Rechazo fisico QA' });
    await request('destino', '/api/movimientos', { documento_id: d.id, usuario_destino_id: usuarios.otro.id, motivo: 'No recuperado' }, 409);
    await request('destino', `/api/movimientos/${m.id}/recuperar`, { archivador_id: archivoDestino, motivo: 'Recuperado QA', confirmar_recuperacion: true });
    m = (await request('destino', '/api/movimientos', { documento_id: d.id, usuario_destino_id: usuarios.origen.id, motivo: 'Salida para cancelacion' }, 201)).movimiento;
    await request('destino', `/api/movimientos/${m.id}/cancelar`, { archivador_id: archivoDestino, motivo: 'Original recuperado QA', confirmar_recuperacion: false }, 400);
    await request('destino', `/api/movimientos/${m.id}/cancelar`, { archivador_id: archivoDestino, motivo: 'Original recuperado QA', confirmar_recuperacion: true });
    await request('destino', `/api/documentos/${d.id}/anular`, { motivo: 'Anulacion QA' });
    assert.equal((await pool.query('SELECT activo FROM documentos WHERE id=$1', [d.id])).rows[0].activo, false);
    assert.ok((await request('secretaria', `/api/documentos/${d.id}/historial`, undefined, 200, 'GET')).historial.length > 5);
    await request('origen', '/api/documentos', { ...contenido, tipo_documental_id: tipos['SíseVe'].id, archivador_id: null }, 400);
    r = await fetch(base + '/api/documentos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contenido) });
    assert.equal(r.status, 401);
    return tokens;
}
