// Pantalla de __TITULO__. Lo compartido llega desde /_ds (se copia al compilar):
//   _ds/comun/web  → api, escape, formatos      _ds/diseno/js → íconos, avisos, ventanas
import { crearApi, basePath } from '../_ds/comun/web/api.js';
import { $ } from '../_ds/comun/web/dom.js';
import { toast, conBoton } from '../_ds/diseno/js/componentes.js';

// Ruta de la app ('/__APP__' o '' con dominio propio), deducida de dónde se sirve este archivo.
const BASE = basePath(import.meta.url, 1);
const api = crearApi((ruta) => BASE + ruta);

api('/api/estado')
  .then((e) => { $('#estado').textContent = `Respondió el servidor de ${e.app}.`; })
  .catch((e) => { $('#estado').textContent = e.message; });

$('#f').addEventListener('submit', (ev) => {
  ev.preventDefault();
  conBoton($('button[type=submit]', ev.target), async () => {
    const r = await api('/api/eco', { method: 'POST', body: { texto: $('#t').value } });
    toast(`El servidor recibió: ${r.texto}`, 'ok');
  });
});
