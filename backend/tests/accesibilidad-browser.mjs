/* global document, getComputedStyle, Node */
/** Comprueba contraste de texto visible frente al fondo sólido heredado; no certifica WCAG completa. */
export async function revisarContraste(page) {
    return page.evaluate(/** Inspecciona estilos computados de textos y controles visibles y calcula los fallos de contraste frente a fondos sólidos. */ () => {
        /** Extrae componentes numéricos de un color CSS computado; devuelve null si el formato no permite comprobarlo. */
        const rgb = v => {
            const n = v.match(/[\d.]+/g)?.map(Number);
            return n && n.length >= 3 ? n : null;
        };
        /** Convierte los canales sRGB a luminancia relativa para calcular la relación de contraste. */
        const luminancia = c => c.slice(0, 3).map(/** Transforma cada entrada de c.slice(0, 3) para construir los datos que comprueba este escenario. */ /** Linealiza un canal sRGB para que su contribución a la luminancia sea proporcional a la luz. */ n => {
            const x = n / 255;
            return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
        }).reduce(/** Pondera los canales lineales con los coeficientes de luminancia relativa usados por el cálculo de contraste. */ (s, x, i) => s + x * [.2126, .7152, .0722][i], 0);
        const fallos = [];
        let comprobados = 0;
        for (const e of document.querySelectorAll('main h1,main h2,main h3,main p,main label,main button,main a,main td,main th,main dt,main dd,main small,main span,header button,nav a')) {
            if (!e.getClientRects().length || e.closest('[disabled]') || !Array.from(e.childNodes).some(/** Selecciona las entradas de Array.from(e.childNodes) que cumplen el criterio requerido por la comprobación. */ /** Reconoce texto propio visible para excluir contenedores sin contenido textual de la medición de contraste. */ n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()))
                continue;
            const css = getComputedStyle(e);
            const color = rgb(css.color);
            if (!color)
                continue;
            let padre = e, fondo = null;
            while (padre) {
                const c = rgb(getComputedStyle(padre).backgroundColor);
                if (c && (c.length < 4 || c[3] === 1)) {
                    fondo = c;
                    break;
                }
                padre = padre.parentElement;
            }
            if (!fondo)
                fondo = [255, 255, 255];
            const a = luminancia(color), b = luminancia(fondo), ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
            const grande = parseFloat(css.fontSize) >= 24 || (parseFloat(css.fontSize) >= 18.66 && Number(css.fontWeight) >= 700);
            const minimo = grande ? 3 : 4.5;
            comprobados++;
            if (ratio < minimo)
                fallos.push({ elemento: e.tagName, texto: e.textContent.trim().slice(0, 65), ratio: Number(ratio.toFixed(2)), minimo, color: css.color });
        }
        const controles = [];
        for (const e of document.querySelectorAll('main input:not([type="hidden"]):not([type="checkbox"]),main select,main textarea')) {
            if (!e.getClientRects().length || e.disabled)
                continue;
            let borde = e;
            while (borde && parseFloat(getComputedStyle(borde).borderTopWidth) === 0)
                borde = borde.parentElement;
            if (!borde)
                continue;
            const color = rgb(getComputedStyle(borde).borderTopColor);
            if (!color)
                continue;
            let padre = borde.parentElement, fondo = null;
            while (padre) {
                const c = rgb(getComputedStyle(padre).backgroundColor);
                if (c && (c.length < 4 || c[3] === 1)) {
                    fondo = c;
                    break;
                }
                padre = padre.parentElement;
            }
            const a = luminancia(color), b = luminancia(fondo ?? [255, 255, 255]), ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
            controles.push({ id: e.id, ratio: Number(ratio.toFixed(2)) });
            if (ratio < 3)
                fallos.push({ elemento: e.tagName, id: e.id, ratio: Number(ratio.toFixed(2)), minimo: 3 });
        }
        return { comprobados, controles, fallos };
    });
}
