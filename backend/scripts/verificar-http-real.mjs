import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../dist/config/env.js';
// Prueba negativa contra el servidor real. No imprime secretos, tokens ni credenciales.
// La cuenta inexistente se genera por ejecución; no se crean usuarios ni se modifica PostgreSQL.
const base = process.env.CHECK_HTTP_URL ?? 'http://127.0.0.1:3108';
const health = await fetch(`${base}/api/health`);
assert.equal(health.status, 200);
assert.equal((await health.json()).status, 'ok');
console.log('OK health real: 200');
const expirado = jwt.sign({ version: 0 }, env.JWT_SECRET, {
    algorithm: 'HS256', subject: '1', issuer: 'sistema-web-documental',
    audience: 'sistema-web-documental-api', expiresIn: -60,
});
for (const [nombre, token] of [['JWT inválido', 'token-invalido'], ['JWT vencido firmado', expirado]]) {
    const response = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 401);
    console.log(`OK ${nombre}: 401`);
}
const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identificador: `verificacion-inexistente-${randomUUID()}`, contrasena: randomUUID() }),
});
assert.equal(login.status, 401);
console.log('OK credenciales incorrectas contra PostgreSQL real: 401');
