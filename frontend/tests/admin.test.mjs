import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { build } from 'vite';
// Contratos de los módulos compilados en memoria; estas regresiones no escriben en PostgreSQL.
const resultado = await build({
    configFile: false, logLevel: 'silent',
    plugins: [{
            name: 'admin-contract-entry',
            /** Reconoce el identificador virtual que permite compilar contratos reales en memoria para estas pruebas. */
            resolveId(id) {
                if (id === 'virtual:admin-contracts')
                    return '\0virtual:admin-contracts';
            },
            /** Construye las exportaciones virtuales desde los módulos reales; evita mantener copias de sus implementaciones en las pruebas. */
            load(id) {
                if (id !== '\0virtual:admin-contracts')
                    return;
                /** Convierte la ruta local en un literal de importación portátil para el módulo virtual de pruebas. */
                const path = file => JSON.stringify(resolve(file).replaceAll('\\', '/'));
                return `
        export { guardarSchema as rolSchema } from ${path('src/features/roles/schemas/roles.schema.ts')};
        export { guardarSchema as oficinaSchema } from ${path('src/features/oficinas/schemas/oficinas.schema.ts')};
        export { crearUsuarioSchema,datosUsuarioSchema } from ${path('src/features/usuarios/schemas/usuarios.schema.ts')};
        export { api as rolesApi } from ${path('src/features/roles/api/roles.api.ts')};
        export { api as oficinasApi } from ${path('src/features/oficinas/api/oficinas.api.ts')};
        export * as usuariosApi from ${path('src/features/usuarios/api/usuarios.api.ts')};
      `;
            },
        }],
    build: { write: false, minify: false, rollupOptions: { input: 'virtual:admin-contracts', preserveEntrySignatures: 'strict', output: { format: 'es', codeSplitting: false } } },
});
const chunk = (Array.isArray(resultado) ? resultado : [resultado]).flatMap(/** Transforma cada entrada de (Array.isArray(resultado) ? resultado : [resultado]) para construir los datos que comprueba este escenario. */ /** Reúne los archivos emitidos por Vite tanto si devolvió un resultado único como si generó varios. */ item => item.output).find(/** Selecciona las entradas de (Array.isArray(resultado) ? resultado : [resultado]).flatMap(item => item.output) que cumplen el criterio requerido por la comprobación. */ /** Identifica el chunk JavaScript de entrada entre los archivos generados por Vite para inspeccionar el código real. */ item => item.type === 'chunk' && item.isEntry);
const { rolSchema, oficinaSchema, crearUsuarioSchema, datosUsuarioSchema, rolesApi, oficinasApi, usuariosApi } = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
const fecha = '2026-10-21T12:00:00.000Z';
const catalogo = { id: '2', nombre: 'Catálogo', reservado: false, usuarios_asociados: 0, fecha_creacion: fecha, fecha_modificacion: fecha };
const formulario = { nombre: 'Nombre', apellido: 'Apellido', nombre_usuario: 'usuario_qa', email: '', telefono: '', rol_id: '2', oficina_id: '2' };
const usuario = { ...formulario, id: '3', email: null, telefono: null, activo: true, rol: 'Usuario', oficina: 'Oficina', fecha_creacion: fecha, fecha_modificacion: fecha };
/** Sustituye temporalmente Fetch, captura la petición y devuelve el cuerpo preparado; restaura el transporte original en finally. */
async function conRespuesta(body, ejecutar, status = 200) {
    const original = globalThis.fetch;
    let request;
    globalThis.fetch = /** Sustituye Fetch por la respuesta controlada y captura la petición del caso, sin utilizar red ni credenciales reales. */
        async (ruta, opciones) => {
            request = { ruta, opciones };
            return new Response(JSON.stringify(body), { status });
        };
    try {
        await ejecutar(/** Devuelve la petición capturada al caso sin exponer la función Fetch sustituida. */ () => request);
    }
    finally {
        globalThis.fetch = original;
    }
}
test('Catálogos normalizan espacios y respetan longitudes reales', /** Verifica el caso «Catálogos normalizan espacios y respetan longitudes reales»; una aserción fallida invalida este resultado. */ () => {
    assert.equal(rolSchema.parse({ nombre: '  Nombre   institucional ' }).nombre, 'Nombre institucional');
    assert.equal(rolSchema.safeParse({ nombre: ' ' }).success, false);
    assert.equal(rolSchema.safeParse({ nombre: 'x'.repeat(101) }).success, false);
    assert.equal(oficinaSchema.safeParse({ nombre: 'x'.repeat(150) }).success, true);
    assert.equal(oficinaSchema.safeParse({ nombre: 'x'.repeat(151) }).success, false);
});
test('Formulario de cuenta normaliza usuario y campos opcionales sin modificar contraseña', /** Verifica el caso «Formulario de cuenta normaliza usuario y campos opcionales sin modificar contraseña»; una aserción fallida invalida este resultado. */ () => {
    const datos = crearUsuarioSchema.parse({ ...formulario, nombre_usuario: ' USUARIO_QA ', contrasena: ' Clave literal ', activo: true });
    assert.equal(datos.nombre_usuario, 'usuario_qa');
    assert.equal(datos.email, null);
    assert.equal(datos.telefono, null);
    assert.equal(datos.contrasena, ' Clave literal ');
});
test('Se rechazan contraseñas cortas, correos inválidos y campos internos', /** Verifica el caso «Se rechazan contraseñas cortas, correos inválidos y campos internos»; una aserción fallida invalida este resultado. */ () => {
    assert.equal(crearUsuarioSchema.safeParse({ ...formulario, contrasena: 'corta', activo: true }).success, false);
    assert.equal(datosUsuarioSchema.safeParse({ ...formulario, email: 'correo-invalido' }).success, false);
    assert.equal(datosUsuarioSchema.safeParse({ ...formulario, version_autenticacion: 999 }).success, false);
    assert.equal(datosUsuarioSchema.safeParse({ ...formulario, contrasena_hash: 'no permitido' }).success, false);
    assert.equal(datosUsuarioSchema.safeParse({ ...formulario, activo: false }).success, false);
});
test('Listado valida paginación y envía filtros y Bearer', /** Verifica el caso «Listado valida paginación y envía filtros y Bearer»; una aserción fallida invalida este resultado. */ async () => {
    await conRespuesta({ usuarios: [usuario], total: 1, pagina: 1, limite: 10 }, /** Comprueba el contrato y la petición capturada del escenario «Listado valida paginación y envía filtros y Bearer» utilizando la respuesta HTTP simulada. */ async (peticion) => {
        const respuesta = await usuariosApi.listar('jwt-qa', 'q=usuario_qa&activo=true');
        assert.equal(respuesta.usuarios[0].id, '3');
        assert.equal(peticion().ruta, '/api/usuarios?q=usuario_qa&activo=true');
        assert.equal(peticion().opciones.headers.get('authorization'), 'Bearer jwt-qa');
    });
});
test('Crear/editar cuenta utilizan endpoints y campos exactos, sin hash', /** Verifica el caso «Crear/editar cuenta utilizan endpoints y campos exactos, sin hash»; una aserción fallida invalida este resultado. */ async () => {
    const datos = crearUsuarioSchema.parse({ ...formulario, contrasena: 'Clave-QA-2026', activo: true });
    await conRespuesta({ usuario }, /** Comprueba el contrato y la petición capturada del escenario «Crear/editar cuenta utilizan endpoints y campos exactos, sin hash» utilizando la respuesta HTTP simulada. */ async (peticion) => {
        await usuariosApi.crear('jwt', datos);
        assert.equal(peticion().opciones.method, 'POST');
        assert.equal(peticion().ruta, '/api/usuarios');
        assert.equal('contrasena_hash' in JSON.parse(peticion().opciones.body), false);
        await usuariosApi.editar('jwt', '3', datosUsuarioSchema.parse(formulario));
        assert.equal(peticion().opciones.method, 'PUT');
        assert.equal(peticion().ruta, '/api/usuarios/3');
        assert.equal('contrasena' in JSON.parse(peticion().opciones.body), false);
    });
});
test('Estado y contraseña son operaciones independientes con contratos validados', /** Verifica el caso «Estado y contraseña son operaciones independientes con contratos validados»; una aserción fallida invalida este resultado. */ async () => {
    await conRespuesta({ usuario }, /** Comprueba el contrato y la petición capturada del escenario «Estado y contraseña son operaciones independientes con contratos validados» utilizando la respuesta HTTP simulada. */ async (peticion) => {
        await usuariosApi.cambiarEstado('jwt', '3', false);
        assert.equal(peticion().ruta, '/api/usuarios/3/estado');
        assert.equal(peticion().opciones.method, 'PATCH');
        assert.deepEqual(JSON.parse(peticion().opciones.body), { activo: false });
    });
    await conRespuesta({ mensaje: 'Contraseña restablecida' }, /** Comprueba el contrato y la petición capturada del escenario «Estado y contraseña son operaciones independientes con contratos validados» utilizando la respuesta HTTP simulada. */ async (peticion) => {
        await usuariosApi.restablecer('jwt', '3', 'Clave nueva QA');
        assert.equal(peticion().ruta, '/api/usuarios/3/contrasena');
        assert.equal(peticion().opciones.method, 'PUT');
        assert.deepEqual(JSON.parse(peticion().opciones.body), { contrasena: 'Clave nueva QA' });
    });
});
test('Roles y oficinas consultan sus APIs reales y no dependen de opciones estáticas', /** Verifica el caso «Roles y oficinas consultan sus APIs reales y no dependen de opciones estáticas»; una aserción fallida invalida este resultado. */ async () => {
    for (const [nombre, api] of [['roles', rolesApi], ['oficinas', oficinasApi]]) {
        await conRespuesta({ [nombre]: [catalogo] }, /** Comprueba el contrato y la petición capturada del escenario «Roles y oficinas consultan sus APIs reales y no dependen de opciones estáticas» utilizando la respuesta HTTP simulada. */ async (peticion) => {
            assert.equal((await api.listar('jwt'))[0].id, catalogo.id);
            assert.equal(peticion().ruta, `/api/${nombre}`);
        });
        await conRespuesta({ registro: catalogo }, /** Comprueba el contrato y la petición capturada del escenario «Roles y oficinas consultan sus APIs reales y no dependen de opciones estáticas» utilizando la respuesta HTTP simulada. */ async (peticion) => {
            await api.guardar('jwt', 'Nuevo');
            assert.equal(peticion().opciones.method, 'POST');
            await api.guardar('jwt', 'Editado', '2');
            assert.equal(peticion().opciones.method, 'PUT');
            assert.equal(peticion().ruta, `/api/${nombre}/2`);
        });
    }
});
test('409 muestra el conflicto público; 500 nunca expone detalles de SQL', /** Verifica el caso «409 muestra el conflicto público; 500 nunca expone detalles de SQL»; una aserción fallida invalida este resultado. */ async () => {
    await conRespuesta({ error: 'El correo electrónico ya está registrado' }, /** Comprueba el contrato y la petición capturada del escenario «409 muestra el conflicto público; 500 nunca expone detalles de SQL» utilizando la respuesta HTTP simulada. */ async () => {
        await assert.rejects(usuariosApi.detalle('jwt', '3'), /correo electrónico ya está registrado/);
    }, 409);
    await conRespuesta({ error: 'SQL privado y datos de conexión' }, /** Comprueba el contrato y la petición capturada del escenario «409 muestra el conflicto público; 500 nunca expone detalles de SQL» utilizando la respuesta HTTP simulada. */ async () => {
        await assert.rejects(usuariosApi.detalle('jwt', '3'), /** Comprueba que el error capturado coincida con el estado o código esperado por el caso. */  error => error.status === 500 && !error.message.includes('privado'));
    }, 500);
});
