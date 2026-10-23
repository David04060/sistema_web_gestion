import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
/** Verifica el grafo generado, no la forma textual de los imports de React. */
test('El build deja las pantallas administrativas fuera de la descarga inicial', /** Verifica el caso «El build deja las pantallas administrativas fuera de la descarga inicial»; una aserción fallida invalida este resultado. */ async () => {
    const resultado = await build({ logLevel: 'silent', build: { write: false } });
    const chunks = (Array.isArray(resultado) ? resultado : [resultado]).flatMap(/** Transforma cada entrada de (Array.isArray(resultado) ? resultado : [resultado]) para construir los datos que comprueba este escenario. */ /** Reúne los archivos emitidos por Vite tanto si devolvió un resultado único como si generó varios. */ r => r.output).filter(/** Selecciona las entradas de (Array.isArray(resultado) ? resultado : [resultado]).flatMap(r => r.output) que cumplen el criterio requerido por la comprobación. */ /** Identifica el chunk JavaScript de entrada entre los archivos generados por Vite para inspeccionar el código real. */ c => c.type === 'chunk');
    const inicial = chunks.find(/** Selecciona las entradas de chunks que cumplen el criterio requerido por la comprobación. */ /** Identifica el chunk JavaScript de entrada entre los archivos generados por Vite para inspeccionar el código real. */ c => c.isEntry);
    assert.ok(inicial);
    const porArchivo = new Map(chunks.map(/** Transforma cada entrada de chunks para construir los datos que comprueba este escenario. */ /** Indexa los chunks por nombre de archivo para recorrer sus imports estáticos sin depender de sus hashes. */ c => [c.fileName, c]));
    const visitados = new Set();
    /** Recorre los imports estáticos del bundle evitando ciclos para identificar lo que se descarga en la entrada inicial. */
    function recorrer(nombre) {
        if (visitados.has(nombre))
            return;
        visitados.add(nombre);
        for (const i of porArchivo.get(nombre)?.imports ?? [])
            recorrer(i);
    }
    recorrer(inicial.fileName);
    const modulosIniciales = [...visitados].flatMap(/** Transforma cada entrada de [...visitados] para construir los datos que comprueba este escenario. */ /** Identifica módulos de pantallas en el grafo generado para comprobar que no entren en la descarga inicial sin autorización de ruta. */ n => Object.keys(porArchivo.get(n)?.modules ?? {})).map(/** Transforma cada entrada de [...visitados].flatMap(n => Object.keys(porArchivo.get(n)?.modules ?? {})) para construir los datos que comprueba este escenario. */ /** Normaliza separadores de rutas para comparar los módulos del bundle de forma portátil. */ n => n.replaceAll('\\', '/'));
    for (const modulo of ['usuarios', 'roles', 'oficinas']) {
        assert.ok(!modulosIniciales.some(/** Selecciona las entradas de modulosIniciales que cumplen el criterio requerido por la comprobación. */ /** Identifica módulos de pantallas en el grafo generado para comprobar que no entren en la descarga inicial sin autorización de ruta. */ n => n.includes(`/features/${modulo}/pages/`)), `${modulo} cargado anticipadamente`);
        assert.ok(chunks.some(/** Selecciona las entradas de chunks que cumplen el criterio requerido por la comprobación. */ /** Normaliza separadores de rutas para comparar los módulos del bundle de forma portátil. */ c => Object.keys(c.modules).some(/** Selecciona las entradas de Object.keys(c.modules) que cumplen el criterio requerido por la comprobación. */ /** Normaliza separadores de rutas para comparar los módulos del bundle de forma portátil. */ n => n.replaceAll('\\', '/').includes(`/features/${modulo}/pages/`))), `${modulo} no emitido`);
    }
    assert.ok(Buffer.byteLength(inicial.code) < 500000, 'El chunk de entrada vuelve a superar 500 kB');
    assert.ok(chunks.some(/** Selecciona las entradas de chunks que cumplen el criterio requerido por la comprobación. */ /** Selecciona los chunks cargados dinámicamente para verificar que se mantenga la división por rutas. */ c => c.isDynamicEntry), 'No hay división dinámica');
});
