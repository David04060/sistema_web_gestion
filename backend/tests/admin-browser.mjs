import assert from 'node:assert/strict';
import { abrirSandbox } from './admin-sandbox.mjs';
// Cuenta de QA efímera, disponible solo en esta transacción. No es una credencial institucional.
const sandbox = await abrirSandbox(3110);
try {
    const roles = (await (await fetch(`${sandbox.base}/api/roles`, { headers: { Authorization: `Bearer ${sandbox.tokenInicial}` } })).json()).roles;
    const res = await fetch(`${sandbox.base}/api/usuarios`, {
        method: 'POST', headers: { Authorization: `Bearer ${sandbox.tokenInicial}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: 'Administrador', apellido: 'QA transaccional', nombre_usuario: 'qa_ui_admin',
            email: null, telefono: null, rol_id: roles.find(/** Selecciona las entradas de roles que cumplen el criterio requerido por la comprobación. */ /** Localiza el rol real del catálogo utilizado por el actor o cuenta efímera de esta prueba. */ rol => rol.nombre === 'Administrador').id, oficina_id: null,
            contrasena: 'Integracion-UI-2026', activo: true }),
    });
    assert.equal(res.status, 201, 'No se pudo preparar la cuenta de prueba.');
    console.log('Integración SQL real para navegador en puerto 3110. Todos los cambios se revierten al cerrar.');
    let cerrando = false;
    /** Cierra los recursos abiertos por esta ejecución y revierte el entorno transaccional cuando corresponde. */
    const cerrar = async () => {
        if (cerrando)
            return;
        cerrando = true;
        await sandbox.cerrar();
    };
    process.on('SIGINT', /** Gestiona el evento del recurso local de pruebas y solicita su cierre o continuación controlada. */ () => {
        void cerrar();
    });
    process.on('SIGTERM', /** Gestiona el evento del recurso local de pruebas y solicita su cierre o continuación controlada. */ () => {
        void cerrar();
    });
}
catch (error) {
    await sandbox.cerrar();
    throw error;
}
