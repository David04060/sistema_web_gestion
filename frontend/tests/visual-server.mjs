import { createServer } from 'vite';
// Sobrescribe el proxy solo en este proceso de QA, sin cambiar vite.config.ts.
const server = await createServer({
    server: { host: '127.0.0.1', port: 5174, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:3107', changeOrigin: true } } },
});
await server.listen();
console.log('Frontend de QA en http://127.0.0.1:5174, conectado al backend ficticio 3107.');
process.on('SIGINT', /** Gestiona el evento del recurso local de pruebas y solicita su cierre o continuación controlada. */ async () => {
    await server.close();
    process.exitCode = 0;
});
