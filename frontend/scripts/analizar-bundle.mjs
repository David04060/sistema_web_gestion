import { build } from 'vite';
import { gzipSync } from 'node:zlib';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
const fase = process.argv[2];
if (!['antes', 'despues'].includes(fase))
    throw new Error('Indique antes o despues');
let informe;
await build({ build: { manifest: true }, plugins: [{ name: 'informe-bundle-local', 
/** Recoge módulos, tamaños e imports del bundle emitido para comparar la descarga inicial y los chunks diferidos. */
            generateBundle(_opciones, bundle) {
                const chunks = Object.values(bundle).filter(/** Selecciona las entradas de Object.values(bundle) que cumplen el criterio requerido por la comprobación. */ /** Identifica el chunk JavaScript de entrada entre los archivos generados por Vite para inspeccionar el código real. */ x => x.type === 'chunk');
                const grupos = {};
                const activos = chunks.map(/** Transforma cada entrada de chunks para construir los datos que comprueba este escenario. */ /** Identifica el chunk JavaScript de entrada entre los archivos generados por Vite para inspeccionar el código real. */ c => {
                    const modulos = Object.entries(c.modules).map(/** Normaliza separadores de rutas para comparar los módulos del bundle de forma portátil. */ ([id, m]) => {
                        const ruta = id.replaceAll('\\', '/');
                        const grupo = ruta.includes('/node_modules/') ? ruta.split('/node_modules/').at(-1).split('/').slice(0, ruta.split('/node_modules/').at(-1).startsWith('@') ? 2 : 1).join('/') : ruta.includes('/features/') ? 'features/' + ruta.split('/features/')[1].split('/')[0] : 'aplicacion-compartida';
                        const bytes = m.renderedLength ?? 0;
                        grupos[grupo] = (grupos[grupo] ?? 0) + bytes;
                        return { ruta: ruta.replace(process.cwd().replaceAll('\\', '/') + '/', ''), bytes };
                    }).sort(/** Ordena las mediciones de mayor a menor tamaño para presentar la contribución al bundle. */ (a, b) => b.bytes - a.bytes);
                    return { archivo: c.fileName, entrada: c.isEntry, dinamico: c.isDynamicEntry, bytes: Buffer.byteLength(c.code), gzip: gzipSync(c.code).length, imports: c.imports, dynamicImports: c.dynamicImports, modulos };
                });
                const assets = Object.values(bundle).filter(/** Selecciona las entradas de Object.values(bundle) que cumplen el criterio requerido por la comprobación. */ /** Selecciona los recursos JavaScript o CSS emitidos que forman parte de la medición del bundle. */ x => x.type === 'asset' && x.fileName.endsWith('.css')).map(/** Transforma cada entrada de Object.values(bundle).filter(x => x.type === 'asset' && x.fileName.endsWith('.css')) para construir los datos que comprueba este escenario. */ /** Registra archivo, bytes y tamaño comprimido de cada recurso emitido para comparar el bundle. */ a => ({ archivo: a.fileName, bytes: Buffer.byteLength(a.source), gzip: gzipSync(a.source).length }));
                informe = { fase, chunks: activos, css: assets, grupos: Object.entries(grupos).map(/** Ordena las contribuciones por grupo de dependencia o funcionalidad para explicar el tamaño final. */ ([grupo, bytes]) => ({ grupo, bytes })).sort(/** Ordena las mediciones de mayor a menor tamaño para presentar la contribución al bundle. */ (a, b) => b.bytes - a.bytes) };
            } }] });
for (const c of [...informe.chunks, ...informe.css]) {
    const buffer = await readFile('dist/' + c.archivo);
    c.bytes = buffer.length;
    c.gzip = gzipSync(buffer, { level: 9 }).length;
}
await mkdir('../docs/optimizacion', { recursive: true });
await writeFile(`../docs/optimizacion/bundle-${fase}.json`, JSON.stringify(informe, null, 2));
console.log(JSON.stringify({ fase, entrada: informe.chunks.filter(/** Selecciona las entradas de informe.chunks que cumplen el criterio requerido por la comprobación. */ /** Selecciona los chunks que forman la entrada principal para resumir la descarga inicial. */ c => c.entrada).map(/** Selecciona los recursos JavaScript o CSS emitidos que forman parte de la medición del bundle. */ ({ archivo, bytes, gzip }) => ({ archivo, bytes, gzip })), grupos: informe.grupos.slice(0, 10) }, null, 2));
