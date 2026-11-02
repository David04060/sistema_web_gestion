import {useSyncExternalStore} from 'react';
import {guardarTema, resolverTema, type Tema} from '../../lib/tema';
import styles from './SelectorTema.module.css';

function almacen() { try { return window.localStorage; } catch { return undefined; } }
function aplicar(tema: Tema) {
    document.documentElement.dataset.tema = tema;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema === 'oscuro' ? '#101b2b' : '#ffffff');
}
function suscribir(notificar: () => void) {
    const sistema = window.matchMedia('(prefers-color-scheme: dark)');
    const sincronizar = () => { aplicar(resolverTema(almacen(), sistema.matches)); notificar(); };
    const preferenciaSistema = () => { sincronizar(); };
    window.addEventListener('paillardelle-tema', notificar);
    window.addEventListener('storage', sincronizar);
    sistema.addEventListener('change', preferenciaSistema);
    return () => {
        window.removeEventListener('paillardelle-tema', notificar);
        window.removeEventListener('storage', sincronizar);
        sistema.removeEventListener('change', preferenciaSistema);
    };
}
function actual(): Tema { return document.documentElement.dataset.tema === 'oscuro' ? 'oscuro' : 'claro'; }

/** Cambia solo tokens en la raíz: no desmonta formularios ni cargas PDF. */
export function SelectorTema() {
    const tema = useSyncExternalStore(suscribir, actual, () => 'claro' as Tema);
    function elegir(valor: Tema) {
        guardarTema(almacen(), valor);
        aplicar(valor);
        window.dispatchEvent(new Event('paillardelle-tema'));
    }
    return <div className={styles.selector} role="group" aria-label="Apariencia">
        {(['claro', 'oscuro'] as const).map(valor => <button key={valor} type="button" aria-pressed={tema === valor} onClick={() => elegir(valor)}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">{valor === 'claro' ? <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></> : <path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z"/>}</svg>
            {valor === 'claro' ? 'Claro' : 'Oscuro'}
        </button>)}
    </div>;
}
