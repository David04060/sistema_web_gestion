import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { validarUrlNeon, validarIdentidadPostgres } from '../dist/config/neon.js';

test('Neon: endpoint directo, host autorizado y validación TLS obligatorios', () => {
    const host = 'ep-fixture.region.aws.neon.tech';
    const url = 'postgresql://sistema_web_app:fixture@' + host + '/neondb?sslmode=verify-full';
    assert.equal(validarUrlNeon(url, host), true);
    for (const valor of [url.replace(host, 'ep-fixture-pooler.region.aws.neon.tech'),
        url.replace('verify-full', 'require'), url.replace('sistema_web_app', 'neondb_owner'),
        url.replace('/neondb', '/otra'), url + '&uselibpqcompat=true']) {
        assert.equal(validarUrlNeon(valor, host), false);
    }
    assert.equal(validarUrlNeon(url, 'ep-otro.region.aws.neon.tech'), false);
});
test('Identidad: rechaza rama, usuario, base o certificado inesperados', () => {
    const identity = { base_datos: 'neondb', usuario: 'sistema_web_app', rama: 'br-production-fixture', version: '18' };
    assert.doesNotThrow(() => validarIdentidadPostgres(identity, true, true, identity.rama));
    assert.throws(() => validarIdentidadPostgres(identity, true, true, 'br-otra'));
    assert.throws(() => validarIdentidadPostgres(identity, false, true, identity.rama));
    assert.throws(() => validarIdentidadPostgres({ ...identity, usuario: 'neondb_owner' }, true, true, identity.rama));
    assert.throws(() => validarIdentidadPostgres({ ...identity, base_datos: 'otra' }, true, true, identity.rama));
    assert.doesNotThrow(() => validarIdentidadPostgres({ ...identity, base_datos: 'sistema_web_final' }, false, false));
});
test('Render production: no carga perfiles locales y rechaza QA o identidad incompleta antes de conectar', () => {
    const env = { ...process.env, RENDER: 'true', DB_PROFILE: 'neon', NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://sistema_web_app:fixture@ep-fixture.region.aws.neon.tech/neondb?sslmode=verify-full',
        JWT_SECRET: 'fixture-sintetico-exclusivo-de-regresion-0000000000000000000000',
        NEON_HOST: 'ep-fixture.region.aws.neon.tech', NEON_BRANCH_ID: 'br-production-fixture',
        CORS_ORIGINS: 'https://sistema-documental-p.pages.dev', TRUST_PROXY_HOPS: '1' };
    const ejecutar = cambios => spawnSync(process.execPath, ['--input-type=module', '-e', "import('./dist/config/env.js')"], {
        env: { ...env, ...cambios }, windowsHide: true, encoding: 'utf8', timeout: 10000,
    }).status;
    assert.equal(ejecutar({}), 0);
    for (const caso of [{ DB_PROFILE: 'neon-qa' }, { DB_PROFILE: 'local' }, { NEON_BRANCH_ID: '' },
        { NEON_HOST: '' }, { NEON_HOST: 'ep-otra.region.aws.neon.tech' }, { TRUST_PROXY_HOPS: '0' },
        { NODE_ENV: 'development' }, { JWT_SECRET: 'REEMPLAZAR_POR_UN_SECRETO_PRIVADO_LARGO' }]) {
        assert.notEqual(ejecutar(caso), 0);
    }
});
