// Si no está instalado 'hono' (p. ej. sin acceso a npm), usa el sustituto mínimo de test/hono-minimo.js.
import { register } from 'node:module';
register('./hook-hono.js', import.meta.url);
