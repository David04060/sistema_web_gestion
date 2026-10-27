import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const commit=process.env.APP_RELEASE_COMMIT;
assert.match(commit??'',/^[a-f0-9]{40}$/,'APP_RELEASE_COMMIT debe identificar el commit publicado');
writeFileSync('dist/version.json',JSON.stringify({version:'20261026-archivo-v1',commit,fecha:new Date().toISOString()})+'\n');
console.log('Metadatos públicos de versión preparados');
