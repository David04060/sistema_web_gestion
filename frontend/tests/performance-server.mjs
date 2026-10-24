import { createServer } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
// Servidor local sintético. No importa pg ni credenciales; intercepta toda /api.
const usuario = { id: '1', nombre: 'Cuenta sintética', apellido: 'Rendimiento', nombre_usuario: 'fixture', email: null, rol: 'Administrador', oficina: null };
const estadisticas = {};
mkdirSync('../.private/performance', { recursive: true });
const server = await createServer({
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify('') },
    server: { host: '127.0.0.1', port: 5176, strictPort: true },
    plugins: [{ name: 'api-sintetica-rendimiento', configureServer(server) {
        server.middlewares.use((req, res, next) => {
            const ruta = req.url?.split('?')[0];
            if (!ruta.startsWith('/api/')) return next();
            estadisticas[ruta] = (estadisticas[ruta] ?? 0) + 1;
            writeFileSync('../.private/performance/navegacion-conteos.json', JSON.stringify(estadisticas));
            let datos;
            if (ruta === '/api/auth/login' && req.method === 'POST') datos = {
                token: `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 })).toString('base64url')}.sintetico`,
                tipo: 'Bearer', expiresIn: 900, usuario,
            };
            else if (req.method !== 'GET') { res.statusCode = 405; datos = { error: 'Escritura no disponible en esta prueba' }; }
            else if (ruta === '/api/auth/me') datos = { usuario };
            else if (ruta === '/api/siseve/acceso') datos = { tipo_documental_id: '1', autorizado: false, administrador: true, puede_registrar: false };
            else if (ruta === '/api/roles') datos = { roles: [] };
            else if (ruta === '/api/dashboard') datos = { alcance: 'administrativo', actualizado: new Date().toISOString(),
                indicadores: [{ clave: 'usuarios', etiqueta: 'Usuarios sintéticos', total: 1 }], estados: [], operaciones: [], recientes: [], pendientes: [],
                accesos: [{ etiqueta: 'Roles', ruta: '/roles' }] };
            else { res.statusCode = 404; datos = { error: 'Ruta no definida en esta prueba' }; }
            globalThis.setTimeout(() => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(datos)); }, ruta === '/api/dashboard' ? 1500 : 150);
        });
    } }],
});
await server.listen();
console.log('Prueba sintética aislada: http://127.0.0.1:5176');
process.on('SIGINT', async () => { await server.close(); process.exitCode = 0; });
