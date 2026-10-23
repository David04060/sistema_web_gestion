import assert from 'node:assert/strict';
import { test } from 'node:test';
import { idSchema } from '../dist/shared/admin/admin.schema.js';
import { guardarSchema as rolSchema } from '../dist/modules/roles/roles.schema.js';
import { guardarSchema as oficinaSchema } from '../dist/modules/oficinas/oficinas.schema.js';
import { crearUsuarioSchema, datosUsuarioSchema, filtrosSchema } from '../dist/modules/usuarios/usuarios.schema.js';
const datos = { nombre: 'Nombre', apellido: 'Apellido', nombre_usuario: 'usuario_qa', email: null, telefono: null, rol_id: '1', oficina_id: null };
test('Los identificadores inválidos nunca provocan excepciones de BigInt durante safeParse', /** Verifica el caso «Los identificadores inválidos nunca provocan excepciones de BigInt durante safeParse»; una aserción fallida invalida este resultado. */ () => {
    for (const id of ['abc', "1' OR 1=1", '0', '-1', '1.1', '9223372036854775808']) {
        assert.equal(idSchema.safeParse(id).success, false);
    }
    assert.equal(idSchema.safeParse('9223372036854775807').success, true);
});
test('Los contratos de catálogos normalizan espacios y respetan las longitudes de PostgreSQL', /** Verifica el caso «Los contratos de catálogos normalizan espacios y respetan las longitudes de PostgreSQL»; una aserción fallida invalida este resultado. */ () => {
    assert.equal(rolSchema.parse({ nombre: '  Rol   institucional  ' }).nombre, 'Rol institucional');
    assert.equal(rolSchema.safeParse({ nombre: ' ' }).success, false);
    assert.equal(rolSchema.safeParse({ nombre: 'x'.repeat(101) }).success, false);
    assert.equal(oficinaSchema.safeParse({ nombre: 'x'.repeat(150) }).success, true);
    assert.equal(oficinaSchema.safeParse({ nombre: 'x'.repeat(151) }).success, false);
});
test('Cuenta administrada: usuario canónico, opcionales nulos y contraseña literal con mínimo vigente', /** Verifica el caso «Cuenta administrada: usuario canónico, opcionales nulos y contraseña literal con mínimo vigente»; una aserción fallida invalida este resultado. */ () => {
    const usuario = crearUsuarioSchema.parse({ ...datos, nombre_usuario: ' USUARIO_QA ', email: '', telefono: '', contrasena: ' Clave QA ' });
    assert.equal(usuario.nombre_usuario, 'usuario_qa');
    assert.equal(usuario.email, null);
    assert.equal(usuario.telefono, null);
    assert.equal(usuario.contrasena, ' Clave QA ');
    assert.equal(usuario.activo, true);
    assert.equal(crearUsuarioSchema.safeParse({ ...datos, contrasena: 'corta' }).success, false);
});
test('La edición personal no admite hash, versión ni estado; filtros acotan paginación y tipos', /** Verifica el caso «La edición personal no admite hash, versión ni estado; filtros acotan paginación y tipos»; una aserción fallida invalida este resultado. */ () => {
    for (const extra of [{ contrasena_hash: 'hash' }, { version_autenticacion: 99 }, { activo: false }]) {
        assert.equal(datosUsuarioSchema.safeParse({ ...datos, ...extra }).success, false);
    }
    assert.equal(datosUsuarioSchema.safeParse({ ...datos, email: 'correo-invalido' }).success, false);
    assert.equal(filtrosSchema.safeParse({ activo: 'yes' }).success, false);
    assert.equal(filtrosSchema.safeParse({ limite: '100000' }).success, false);
    assert.equal(filtrosSchema.safeParse({ pagina: '0' }).success, false);
});
