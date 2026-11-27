import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import ts from 'typescript';
const raiz = fileURLToPath(new URL('../../', import.meta.url));
const directorios = ['frontend/src', 'backend/src', 'frontend/tests', 'backend/tests', 'frontend/scripts', 'backend/scripts'];
/** Recorre únicamente código propio; no incorpora dependencias, compilados ni archivos privados. */
function archivos(directorio) {
    return fs.readdirSync(directorio, { withFileTypes: true }).flatMap(entrada => {
        const ruta = path.join(directorio, entrada.name);
        return entrada.isDirectory() ? archivos(ruta) : /\.(?:tsx?|mjs)$/.test(ruta) ? [ruta] : [];
    });
}
/** Localiza la declaración que recibe el comentario de una función asignada a una variable. */
function propietario(nodo) {
    if (ts.isVariableDeclaration(nodo.parent))
        return nodo.parent.parent.parent;
    if (ts.isPropertyAssignment(nodo.parent) || ts.isPropertyDeclaration(nodo.parent))
        return nodo.parent;
    return nodo;
}
/** Cuenta implementaciones reales; las firmas de tipos no tienen cuerpo ni necesitan JSDoc propio. */
function inspeccionar(ruta) {
    const contenido = fs.readFileSync(ruta, 'utf8');
    const fuente = ts.createSourceFile(ruta, contenido, ts.ScriptTarget.Latest, true);
    const funciones = [];
    /** Visita el árbol sintáctico y registra ubicación, identidad y documentación cercana verificable. */
    function visitar(nodo) {
        if (ts.isFunctionLike(nodo) && nodo.body) {
            const dueno = propietario(nodo);
            const comentarios = ts.getLeadingCommentRanges(contenido, dueno.getFullStart()) ?? [];
            const propios = ts.getLeadingCommentRanges(contenido, nodo.getFullStart()) ?? [];
            const documentada = ts.getJSDocCommentsAndTags(nodo).length > 0 || [...comentarios, ...propios].some(c => contenido.slice(c.pos, c.end).startsWith('/**'));
            const nombre = ts.isConstructorDeclaration(nodo) ? 'constructor' : nodo.name?.getText(fuente) ?? (ts.isVariableDeclaration(nodo.parent) || ts.isPropertyAssignment(nodo.parent) || ts.isPropertyDeclaration(nodo.parent) ? nodo.parent.name.getText(fuente) : null);
            funciones.push({ nombre, linea: fuente.getLineAndCharacterOfPosition(nodo.getStart()).line + 1,
                parametros: nodo.parameters.map(p => p.name.getText(fuente)), documentada,
                clase: nombre ? 'declarada' : 'callback', caracteres: nodo.end - nodo.getStart() });
        }
        ts.forEachChild(nodo, visitar);
    }
    visitar(fuente);
    return { archivo: path.relative(raiz, ruta).replaceAll('\\', '/'), funciones };
}
const detalle = directorios.flatMap(/** Reúne las rutas de los directorios de aplicación y soporte incluidos en el alcance. */  d => archivos(path.join(raiz, d))).map(inspeccionar);
const funciones = detalle.flatMap(/** Reúne las implementaciones de todos los archivos incluidos en el inventario. */ d => d.funciones);
const informe = { archivos: detalle.length, funciones: funciones.length,
    documentadas: funciones.filter(/** Selecciona las implementaciones cuya documentación fue localizada por el análisis sintáctico. */ f => f.documentada).length,
    declaradas: funciones.filter(/** Selecciona la categoría de función para distinguir declaraciones y callbacks en el informe. */ f => f.clase === 'declarada').length,
    callbacks: funciones.filter(/** Selecciona la categoría de función para distinguir declaraciones y callbacks en el informe. */ f => f.clase === 'callback').length, detalle };
const destino = process.argv[2];
if (destino && destino !== '--check')
    fs.writeFileSync(path.resolve(destino), JSON.stringify(informe, null, 2) + '\n');
else if (destino === '--check')
    console.log(JSON.stringify({ archivos: informe.archivos, funciones: informe.funciones, documentadas: informe.documentadas, pendientes: informe.funciones - informe.documentadas }, null, 2));
else
    console.log(JSON.stringify(informe, null, 2));
if (process.argv.includes('--check') && informe.documentadas !== informe.funciones)
    process.exitCode = 1;
