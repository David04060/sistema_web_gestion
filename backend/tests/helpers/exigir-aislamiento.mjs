/** Archivo: Detiene una prueba SQL si no se ha comprobado su entorno temporal.
 */
import { verificarEntornoPrueba } from './entorno-prueba.mjs';

// Ningún caso SQL continúa si falta la identidad de la instancia efímera.
await verificarEntornoPrueba();
