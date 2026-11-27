import { URL } from 'node:url';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {test} from 'node:test';

test('El código local retira los módulos exclusivos y el contexto de autorización restringida', () => {
  for (const ruta of ['backend/src/modules/siseve','frontend/src/features/siseve'])
    assert.equal(existsSync(new URL('../../'+ruta,import.meta.url)),false,ruta);
  assert.doesNotMatch(readFileSync(new URL('../src/shared/documental/contexto.ts',import.meta.url),'utf8'),/ejecutarRestringido|app\.tipo_restringido_id/);
});
