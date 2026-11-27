/** Archivo: Lee una contraseña de forma oculta en terminal y genera la huella compatible con el servidor.
 */
import { stdin, stdout } from 'node:process';
import { generarHash } from '../dist/shared/security/password.js';
if (!stdin.isTTY)
  throw new Error('Ejecute en una terminal interactiva; no pase la contraseña por argumentos ni archivos');
stdout.write('Contraseña (entrada oculta, 8–128 caracteres): ');
stdin.setRawMode(true);
stdin.resume();
stdin.setEncoding('utf8');
let valor = '';
stdin.on('data', async (texto) => {
  if (texto === '\u0003') {
    stdin.setRawMode(false);
    stdin.pause();
    stdout.write('\nCancelado\n');
    return;
  }
  if (texto.includes('\r') || texto.includes('\n')) {
    stdin.setRawMode(false);
    stdin.pause();
    stdout.write('\n');
    if (valor.length < 8 || valor.length > 128) {
      valor = '';
      stdout.write('La contraseña debe tener entre 8 y 128 caracteres; no se generó hash.\n');
      return;
    }
    const hash = await generarHash(valor);
    valor = '';
    stdout.write(hash + '\n');
    return;
  }
  if (texto === '\u007f' || texto === '\b') valor = valor.slice(0, -1);
  else valor += texto;
});
