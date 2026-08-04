#!/usr/bin/env node
// Гейт лицензий npm-зависимостей (B52 — контроль copyleft).
//
// Читает frontend/package-lock.json и завершается с ошибкой (exit 1), если
// среди зависимостей встречается strong/weak copyleft, несовместимый с
// проприетарной поставкой (GPL / AGPL / LGPL / SSPL), либо у prod-зависимости
// лицензия не определена (UNKNOWN). Namespace npm LGPL держим запрещённым:
// на этой стороне его нет (в отличие от Python-драйвера psycopg, см.
// scripts/check_licenses.py и reports/B52-licenses.md).
//
// Без внешних зависимостей — разбираем lock-файл напрямую, чтобы гейт сам не
// тянул новых пакетов (та же логика, что применялась при аудите).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const lockPath = resolve(here, '..', 'frontend', 'package-lock.json');

/** Достаёт строку лицензии из записи lock-файла (string | {type} | licenses[]). */
function licenseString(entry) {
  if (!entry) return '';
  if (typeof entry.license === 'string') return entry.license;
  if (entry.license && typeof entry.license === 'object' && entry.license.type) {
    return entry.license.type;
  }
  if (Array.isArray(entry.licenses)) {
    return entry.licenses.map((l) => (typeof l === 'string' ? l : l.type || '')).join(' ');
  }
  return '';
}

/** Возвращает вид запрещённой лицензии или null. Порядок важен: AGPL/LGPL до GPL. */
function forbiddenLicense(lic) {
  const s = String(lic).toUpperCase();
  if (/AGPL/.test(s)) return 'AGPL';
  if (/LGPL/.test(s)) return 'LGPL';
  if (/(^|[^L])GPL/.test(s)) return 'GPL';
  if (/SSPL/.test(s)) return 'SSPL';
  return null;
}

const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const packages = lock.packages || {};

const violations = [];
const unknownProd = [];

for (const [path, entry] of Object.entries(packages)) {
  if (path === '') continue; // корневой пакет — наш собственный код
  if (!path.includes('node_modules/')) continue;
  const name = path.replace(/.*node_modules\//, '');
  const lic = licenseString(entry);
  const bad = forbiddenLicense(lic);
  if (bad) {
    violations.push({ name, version: entry.version, license: lic || '(нет)', kind: bad, dev: !!entry.dev });
  } else if (!lic && !entry.dev) {
    unknownProd.push({ name, version: entry.version });
  }
}

if (unknownProd.length) {
  console.warn('⚠ prod-зависимости без указанной лицензии (UNKNOWN):');
  for (const p of unknownProd) console.warn(`  - ${p.name}@${p.version}`);
}

if (violations.length || unknownProd.length) {
  console.error('\n✖ Гейт лицензий npm: обнаружены запрещённые/неизвестные лицензии');
  for (const v of violations) {
    console.error(`  - ${v.name}@${v.version}: ${v.license} [${v.kind}]${v.dev ? ' (dev)' : ''}`);
  }
  console.error(
    '\nЗапрещены copyleft-лицензии GPL/AGPL/LGPL/SSPL; перечень компонентов — THIRD-PARTY-NOTICES.md.',
  );
  process.exit(1);
}

console.log(`✓ Гейт лицензий npm: copyleft (GPL/AGPL/LGPL/SSPL) не обнаружен (${
  Object.keys(packages).length - 1
} пакетов проверено).`);
