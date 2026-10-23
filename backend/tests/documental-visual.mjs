import { setTimeout } from 'node:timers/promises';
import { existsSync } from 'node:fs';
/** Servidor de QA visual opcional; utiliza solo la base efimera ya protegida por el verificador. */
export async function iniciarVisual(base, registrar) {
    await registrar();
    const { createServer } = await import('../../frontend/node_modules/vite/dist/node/index.js');
    const vite = await createServer({ root: '../frontend', server: { host: '127.0.0.1', port: 5176, strictPort: true, proxy: { '/api': { target: base, changeOrigin: true } } } });
    await vite.listen();
    console.log('QA visual real disponible en http://127.0.0.1:5176. Finalizar creando backend/.private/finalizar-qa-visual.');
    try {
        const limite = Date.now() + 20 * 60 * 1000;
        while (Date.now() < limite && !existsSync('.private/finalizar-qa-visual'))
            await setTimeout(1000);
    }
    finally {
        await vite.close();
    }
}
