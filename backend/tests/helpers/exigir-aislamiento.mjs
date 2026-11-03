import {verificarEntornoPrueba} from './entorno-prueba.mjs';

// Ningún caso SQL continúa si falta la identidad de la instancia efímera.
await verificarEntornoPrueba();
