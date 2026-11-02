import {build} from 'vite';
// El artefacto de pruebas utiliza /api de la misma copia, nunca la API pública.
process.env.VITE_API_URL='';
await build({build:{outDir:'../backend/.private/clasificacion-ui',emptyOutDir:true}});
