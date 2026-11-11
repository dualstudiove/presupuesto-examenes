import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.DATABASE_FILE = ':memory:';
process.env.BCV_DISABLED = 'true';
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-1234';
process.env.BASE_DOMAIN = 'localhost';

const RANGO = (() => { const h = new Date(Date.now() + 86400000).toISOString().slice(0, 10); const d = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10); return { desde: d, hasta: h }; })();
let server;
let port;
const jars = new Map();

/** Petición HTTP con cabecera Host (subdominio) y cookies por "jar". */
function pedir({ host, method = 'GET', path = '/', body, jar = 'anon', headers = {} }) {
  return new Promise((resolve, reject) => {
    const data = body !== undefined ? JSON.stringify(body) : undefined;
    const h = { host, 'x-app': '1', ...headers };
    if (data) { h['content-type'] = 'application/json'; h['content-length'] = Buffer.byteLength(data); }
    const ck = jars.get(jar);
    if (ck) h.cookie = ck;
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: h }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const set = res.headers['set-cookie'];
        if (set) {
          const pares = set.map((s) => s.split(';')[0]).filter((s) => !s.endsWith('='));
          if (pares.length) jars.set(jar, pares.join('; '));
          else if (set.some((s) => /Max-Age=0/.test(s))) jars.delete(jar);
        }
        const texto = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(texto); } catch { /* no es JSON */ }
        resolve({ status: res.statusCode, json, texto, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const demo = (o) => pedir({ host: 'demo.localhost', ...o });
const norte = (o) => pedir({ host: 'norte.localhost', ...o });

before(async () => {
  const { sembrar } = await import('../src/seed.js');
  await sembrar({ demo: true });
  const { start } = await import('../src/server.js');
  server = await start({ port: 0, host: '127.0.0.1', programador: false });
  port = server.address().port;
});

after(() => server?.close());

test('el subdominio decide el negocio y se aíslan los datos', async () => {
  const a = await demo({ path: '/api/publico/catalogo' });
  const b = await norte({ path: '/api/publico/catalogo' });
  assert.equal(a.status, 200);
  assert.ok(a.json.examenes.length >= 30, 'demo tiene ~34 exámenes');
  assert.equal(a.json.perfiles.length, 4);
  assert.equal(b.json.examenes.length, 4);
  const idsA = new Set(a.json.examenes.map((e) => e.id));
  assert.ok(b.json.examenes.every((e) => !idsA.has(e.id)), 'ningún examen de un negocio aparece en el otro');
  const c = await pedir({ host: 'noexiste.localhost', path: '/api/publico/catalogo' });
  assert.equal(c.status, 404);
});

test('la raíz no sirve la API de un negocio y las páginas respetan el dominio', async () => {
  assert.equal((await pedir({ host: 'localhost', path: '/api/publico/catalogo' })).status, 404);
  assert.match((await pedir({ host: 'localhost', path: '/' })).texto, /Plataforma/i);
  assert.match((await demo({ path: '/' })).texto, /<div id="app">/);
  assert.equal((await demo({ path: '/super' })).status, 404);
});

test('config pública: color, vigencia, orígenes y tasa', async () => {
  const r = await demo({ path: '/api/publico/config' });
  assert.equal(r.status, 200);
  assert.equal(r.json.negocio.nombre, 'Laboratorio Demo');
  assert.equal(r.json.negocio.dias_vigencia, 7);
  assert.ok(r.json.origenes.length >= 4);
  assert.equal(r.json.tasa.valor, 100);
});

test('presupuesto: total en REF, conversión solo del total y código correlativo', async () => {
  const cat = (await demo({ path: '/api/publico/catalogo' })).json;
  const glic = cat.examenes.find((e) => e.nombre === 'Glicemia');
  const tsh = cat.examenes.find((e) => e.nombre === 'TSH');
  const r = await demo({ method: 'POST', path: '/api/publico/presupuesto', body: { items: [{ tipo: 'examen', id: glic.id }, { tipo: 'examen', id: tsh.id }], dispositivo: 'movil' } });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.total_ref_cent, 250 + 600);
  assert.equal(r.json.total_bs_cent, 85000, '8,50 REF × 100 = 850,00 Bs.');
  assert.match(r.json.codigo, /^DEM-\d{6}$/);
  assert.equal(r.json.items.length, 2);
  assert.ok(r.json.vigencia_hasta > r.json.dia);
  const r2 = await demo({ method: 'POST', path: '/api/publico/presupuesto', body: { items: [{ tipo: 'examen', id: glic.id }] } });
  assert.equal(Number(r2.json.codigo.slice(-6)), Number(r.json.codigo.slice(-6)) + 1);
});

test('anti-duplicados en el servidor: examen suelto + perfil que lo incluye', async () => {
  const cat = (await demo({ path: '/api/publico/catalogo' })).json;
  const basico = cat.perfiles.find((p) => p.nombre === 'Perfil básico');
  const hema = cat.examenes.find((e) => e.nombre === 'Hematología completa');
  const r = await demo({ method: 'POST', path: '/api/publico/presupuesto', body: { items: [{ tipo: 'perfil', id: basico.id }, { tipo: 'examen', id: hema.id }] } });
  assert.equal(r.status, 409);
  assert.match(r.json.error, /Hematología completa/);
});

test('anti-duplicados en el servidor: dos perfiles que comparten exámenes', async () => {
  const cat = (await demo({ path: '/api/publico/catalogo' })).json;
  const basico = cat.perfiles.find((p) => p.nombre === 'Perfil básico');
  const lipidico = cat.perfiles.find((p) => p.nombre === 'Perfil lipídico');
  const r = await demo({ method: 'POST', path: '/api/publico/presupuesto', body: { items: [{ tipo: 'perfil', id: basico.id }, { tipo: 'perfil', id: lipidico.id }] } });
  assert.equal(r.status, 409);
  assert.match(r.json.error, /Colesterol total|Triglicéridos/);
  // perfiles sin exámenes en común sí se pueden combinar
  const tiroideo = cat.perfiles.find((p) => p.nombre === 'Perfil tiroideo');
  const ok = await demo({ method: 'POST', path: '/api/publico/presupuesto', body: { items: [{ tipo: 'perfil', id: lipidico.id }, { tipo: 'perfil', id: tiroideo.id }] } });
  assert.equal(ok.status, 200, ok.texto);
  assert.equal(ok.json.total_ref_cent, 900 + 1500);
  assert.deepEqual(ok.json.items.find((i) => i.nombre === 'Perfil lipídico').incluye.length, 4);
});

test('un presupuesto no puede usar ítems de otro negocio', async () => {
  const catNorte = (await norte({ path: '/api/publico/catalogo' })).json;
  const r = await demo({ method: 'POST', path: '/api/publico/presupuesto', body: { items: [{ tipo: 'examen', id: catNorte.examenes[0].id }] } });
  assert.equal(r.status, 409);
});

test('no se guardan datos personales: los campos extra se ignoran', async () => {
  const cat = (await demo({ path: '/api/publico/catalogo' })).json;
  const e = cat.examenes[0];
  const r = await demo({ method: 'POST', path: '/api/publico/presupuesto', body: { items: [{ tipo: 'examen', id: e.id }], paciente: { nombre: 'María Pérez', cedula: 'V-12345678' }, nombre: 'María Pérez' } });
  assert.equal(r.status, 200);
  const { db } = await import('../src/db.js');
  const cols = (await db.all("SELECT name FROM pragma_table_info('presupuestos')")).map((c) => c.name);
  assert.ok(!cols.some((c) => c === 'nombre' || /cedula|telefono|medico|paciente/.test(c)), `columnas: ${cols}`);
  const todo = JSON.stringify(await db.all('SELECT * FROM presupuestos'));
  assert.ok(!todo.includes('María') && !todo.includes('12345678'));
});

test('el administrador exige sesión y la sesión es solo de su negocio', async () => {
  assert.equal((await demo({ path: '/api/admin/catalogo' })).status, 401);
  assert.equal((await demo({ method: 'POST', path: '/api/admin/login', body: { email: 'admin@demo.test', password: 'mala-clave' }, jar: 'x' })).status, 401);
  const ok = await demo({ method: 'POST', path: '/api/admin/login', body: { email: 'admin@demo.test', password: 'Demo12345' }, jar: 'admin-demo' });
  assert.equal(ok.status, 200);
  assert.equal((await demo({ path: '/api/admin/catalogo', jar: 'admin-demo' })).status, 200);
  // La cookie del demo no sirve en el otro negocio
  jars.set('cruzada', jars.get('admin-demo'));
  assert.equal((await norte({ path: '/api/admin/catalogo', jar: 'cruzada' })).status, 401);
  // El admin de un negocio no puede entrar al otro
  assert.equal((await norte({ method: 'POST', path: '/api/admin/login', body: { email: 'admin@demo.test', password: 'Demo12345' } })).status, 401);
});

test('mutaciones exigen la cabecera x-app (protección CSRF)', async () => {
  const r = await pedir({ host: 'demo.localhost', method: 'POST', path: '/api/admin/logout', headers: { 'x-app': '0' } });
  assert.equal(r.status, 403);
});

test('bloqueo tras 5 intentos fallidos', async () => {
  let ultimo;
  for (let i = 0; i < 6; i++) ultimo = await norte({ method: 'POST', path: '/api/admin/login', body: { email: 'admin@norte.test', password: 'incorrecta' } });
  assert.equal(ultimo.status, 429);
  // incluso la clave correcta queda bloqueada temporalmente
  assert.equal((await norte({ method: 'POST', path: '/api/admin/login', body: { email: 'admin@norte.test', password: 'Norte12345' } })).status, 429);
});

test('CRUD de exámenes: nombre único, precio y fecha de actualización de precios', async () => {
  const antes = (await demo({ path: '/api/publico/config' })).json.precios_actualizados_en;
  const cat = (await demo({ path: '/api/admin/catalogo', jar: 'admin-demo' })).json;
  const hema = cat.categorias.find((c) => c.nombre === 'Hematología');
  const dup = await demo({ method: 'POST', path: '/api/admin/examenes', jar: 'admin-demo', body: { nombre: 'glicemia', categoria_id: hema.id, precio_cent: 100 } });
  assert.equal(dup.status, 409);
  await new Promise((r) => setTimeout(r, 15));
  const nuevo = await demo({ method: 'POST', path: '/api/admin/examenes', jar: 'admin-demo', body: { nombre: 'Examen de prueba', categoria_id: hema.id, precio_cent: 1234 } });
  assert.equal(nuevo.status, 200);
  const despues = (await demo({ path: '/api/publico/config' })).json.precios_actualizados_en;
  assert.ok(despues > antes, 'crear un examen actualiza la fecha de precios');
  // editar solo la descripción NO cambia la fecha de precios
  await new Promise((r) => setTimeout(r, 15));
  await demo({ method: 'PUT', path: `/api/admin/examenes/${nuevo.json.id}`, jar: 'admin-demo', body: { descripcion: 'Texto' } });
  assert.equal((await demo({ path: '/api/publico/config' })).json.precios_actualizados_en, despues);
  const mal = await demo({ method: 'PUT', path: `/api/admin/examenes/${nuevo.json.id}`, jar: 'admin-demo', body: { precio_cent: -5 } });
  assert.equal(mal.status, 400);
  assert.equal((await demo({ method: 'DELETE', path: `/api/admin/examenes/${nuevo.json.id}`, jar: 'admin-demo' })).status, 200);
});

test('un administrador no puede tocar datos de otro negocio por id', async () => {
  const idNorte = (await norte({ path: '/api/publico/catalogo' })).json.examenes[0].id;
  const r = await demo({ method: 'PUT', path: `/api/admin/examenes/${idNorte}`, jar: 'admin-demo', body: { nombre: 'Hackeado' } });
  assert.equal(r.status, 404);
  assert.equal((await demo({ method: 'DELETE', path: `/api/admin/examenes/${idNorte}`, jar: 'admin-demo' })).status, 404);
});

test('ajuste masivo de precios: simulación y aplicación', async () => {
  const cat = (await demo({ path: '/api/admin/catalogo', jar: 'admin-demo' })).json;
  const hormonas = cat.categorias.find((c) => c.nombre === 'Hormonas');
  const sim = await demo({ method: 'POST', path: '/api/admin/precios/masivo', jar: 'admin-demo', body: { alcance: 'categoria', categoria_id: hormonas.id, porcentaje: 10, simular: true } });
  assert.equal(sim.json.afectados, 5);
  assert.equal(sim.json.ejemplos[0].despues, Math.round(sim.json.ejemplos[0].antes * 1.1));
  const antes = (await demo({ path: '/api/publico/catalogo' })).json.examenes.find((e) => e.nombre === 'TSH').precio_cent;
  await demo({ method: 'POST', path: '/api/admin/precios/masivo', jar: 'admin-demo', body: { alcance: 'categoria', categoria_id: hormonas.id, porcentaje: 10 } });
  const desp = (await demo({ path: '/api/publico/catalogo' })).json.examenes.find((e) => e.nombre === 'TSH').precio_cent;
  assert.equal(desp, Math.round(antes * 1.1));
  assert.equal((await demo({ method: 'POST', path: '/api/admin/precios/masivo', jar: 'admin-demo', body: { alcance: 'todo', porcentaje: 0 } })).status, 400);
});

test('dashboard: totales, rankings (perfiles aportan exámenes y categorías) y orígenes', async () => {
  const d = (await demo({ path: `/api/admin/dashboard?desde=${RANGO.desde}&hasta=${RANGO.hasta}`, jar: 'admin-demo' })).json;
  assert.ok(d.resumen.presupuestos > 100);
  assert.ok(d.resumen.visitas >= d.resumen.presupuestos);
  assert.ok(d.resumen.conversion > 0 && d.resumen.conversion <= 100);
  assert.ok(d.top_examenes.length > 0 && d.top_examenes[0].veces >= d.top_examenes.at(-1).veces);
  assert.ok(d.top_examenes.some((e) => e.veces > e.sueltos), 'hay exámenes contados vía perfil');
  assert.ok(d.top_perfiles.length > 0);
  assert.ok(d.categorias.length >= 4);
  assert.equal(d.origenes.reduce((s, o) => s + o.n, 0), d.resumen.presupuestos);
  assert.ok(d.origenes.some((o) => o.nombre === 'No indicó'));
  assert.equal(d.horas.length, 24);
  assert.equal(d.dias_semana.length, 7);
  // Otro negocio ve solo lo suyo
  const n = await norte({ method: 'POST', path: '/api/admin/login', body: { email: 'admin@norte.test', password: 'Norte12345' }, jar: 'admin-norte' });
  void n; // puede estar bloqueado por la prueba anterior; el aislamiento se comprueba en SQL:
  const { db } = await import('../src/db.js');
  const idNorte = (await db.get("SELECT id FROM negocios WHERE slug = 'norte'")).id;
  const { calcularDashboard } = await import('../src/dashboard.js');
  assert.equal((await calcularDashboard(idNorte, RANGO.desde, RANGO.hasta)).resumen.presupuestos, 0);
});

test('exportar CSV del dashboard', async () => {
  const r = await demo({ path: `/api/admin/dashboard/csv?tipo=examenes&desde=${RANGO.desde}&hasta=${RANGO.hasta}`, jar: 'admin-demo' });
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /text\/csv/);
  assert.match(r.texto, /^﻿Examen;Categoría;/);
  assert.equal((await demo({ path: '/api/admin/dashboard/csv?tipo=otro', jar: 'admin-demo' })).status, 400);
});

test('configuración: tasa manual, prefijo y validaciones', async () => {
  const mal = await demo({ method: 'PUT', path: '/api/admin/config', jar: 'admin-demo', body: { usar_tasa_manual: true } });
  assert.equal(mal.status, 400);
  const ok = await demo({ method: 'PUT', path: '/api/admin/config', jar: 'admin-demo', body: { usar_tasa_manual: true, tasa_manual: 123.4567, dias_vigencia: 30, prefijo_codigo: 'lab' } });
  assert.equal(ok.status, 200);
  const cfg = (await demo({ path: '/api/publico/config' })).json;
  assert.equal(cfg.tasa.valor, 123.4567);
  assert.equal(cfg.tasa.manual, true);
  assert.equal(cfg.negocio.dias_vigencia, 30);
  const cat = (await demo({ path: '/api/publico/catalogo' })).json;
  const r = await demo({ method: 'POST', path: '/api/publico/presupuesto', body: { items: [{ tipo: 'examen', id: cat.examenes[0].id }] } });
  assert.match(r.json.codigo, /^LAB-\d{6}$/);
  assert.equal(r.json.tasa.valor, 123.4567);
  assert.equal((await demo({ method: 'PUT', path: '/api/admin/config', jar: 'admin-demo', body: { color_principal: 'rojo' } })).status, 400);
  await demo({ method: 'PUT', path: '/api/admin/config', jar: 'admin-demo', body: { usar_tasa_manual: false } });
});

test('superadministrador: crea negocios, valida subdominio y los desactiva', async () => {
  assert.equal((await pedir({ host: 'localhost', path: '/api/super/negocios' })).status, 401);
  assert.equal((await pedir({ host: 'demo.localhost', method: 'POST', path: '/api/super/login', body: { email: 'super@plataforma.test', password: 'Super12345' } })).status, 404);
  const login = await pedir({ host: 'localhost', method: 'POST', path: '/api/super/login', body: { email: 'super@plataforma.test', password: 'Super12345' }, jar: 'super' });
  assert.equal(login.status, 200);
  const S = (o) => pedir({ host: 'localhost', jar: 'super', ...o });
  assert.equal((await S({ method: 'POST', path: '/api/super/negocios', body: { nombre: 'X', slug: 'admin', admin_email: 'a@b.co', admin_password: 'abcdefgh1' } })).status, 400);
  assert.equal((await S({ method: 'POST', path: '/api/super/negocios', body: { nombre: 'X', slug: 'demo', admin_email: 'a@b.co', admin_password: 'abcdefgh1' } })).status, 409);
  const nuevo = await S({ method: 'POST', path: '/api/super/negocios', body: { nombre: 'Lab Central', slug: 'labcentral', admin_email: 'dueno@labcentral.test', admin_password: 'Central2026!' } });
  assert.equal(nuevo.status, 200, nuevo.texto);
  const nuevoCat = await pedir({ host: 'labcentral.localhost', path: '/api/publico/catalogo' });
  assert.equal(nuevoCat.status, 200);
  assert.ok(nuevoCat.json.categorias.length >= 6);
  assert.equal((await pedir({ host: 'labcentral.localhost', method: 'POST', path: '/api/admin/login', body: { email: 'dueno@labcentral.test', password: 'Central2026!' } })).status, 200);
  await S({ method: 'PUT', path: `/api/super/negocios/${nuevo.json.id}`, body: { activo: false } });
  assert.equal((await pedir({ host: 'labcentral.localhost', path: '/api/publico/catalogo' })).status, 403);
  const lista = await S({ path: '/api/super/negocios' });
  assert.equal(lista.json.negocios.length, 3);
});

test('visitas anónimas y cabeceras de seguridad', async () => {
  const r = await demo({ method: 'POST', path: '/api/publico/visita', body: { dispositivo: 'escritorio' } });
  assert.equal(r.status, 200);
  const { db } = await import('../src/db.js');
  const cols = (await db.all("SELECT name FROM pragma_table_info('visitas')")).map((c) => c.name);
  assert.deepEqual(cols.sort(), ['creado_en', 'dia', 'dispositivo', 'dow', 'hora', 'id', 'negocio_id'].sort());
  const p = await demo({ path: '/' });
  assert.match(p.headers['content-security-policy'], /script-src 'self'/);
  assert.equal(p.headers['x-frame-options'], 'DENY');
});

test('el analizador de la tasa BCV entiende los formatos conocidos', async () => {
  const { parseTasa } = await import('../src/bcv.js');
  assert.deepEqual(parseTasa({ fuente: 'oficial', promedio: 301.37, fechaActualizacion: '2026-01-01T21:02:47.165Z' }), { valor: 301.37, fechaValor: '2026-01-01' });
  assert.equal(parseTasa({ price: '45,5' }).valor, 45.5);
  assert.equal(parseTasa({ monitors: { usd: { price: 50 } } }).valor, 50);
  assert.equal(parseTasa({ promedio: null, venta: 12 }).valor, 12);
  assert.equal(parseTasa({ nada: 1 }), null);
  assert.equal(parseTasa({ promedio: -3 }), null);
});
