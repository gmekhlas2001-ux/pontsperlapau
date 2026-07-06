import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const localeDirectory = path.join(root, 'src', 'i18n', 'locales');
const locales = ['en', 'es', 'ca', 'fa'];
const dictionaries = Object.fromEntries(
  locales.map((locale) => [
    locale,
    JSON.parse(fs.readFileSync(path.join(localeDirectory, `${locale}.json`), 'utf8')),
  ]),
);

function leafPaths(value, prefix = '', result = []) {
  for (const [key, child] of Object.entries(value)) {
    const current = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') result.push(current);
    else leafPaths(child, current, result);
  }
  return result;
}

function getAtPath(value, keyPath) {
  return keyPath.split('.').reduce((current, key) => current?.[key], value);
}

const englishPaths = leafPaths(dictionaries.en);
const errors = [];

for (const locale of locales.slice(1)) {
  const missing = englishPaths.filter((keyPath) => typeof getAtPath(dictionaries[locale], keyPath) !== 'string');
  const extra = leafPaths(dictionaries[locale]).filter((keyPath) => !englishPaths.includes(keyPath));
  if (missing.length) errors.push(`${locale}: missing ${missing.join(', ')}`);
  if (extra.length) errors.push(`${locale}: extra ${extra.join(', ')}`);
  for (const keyPath of englishPaths) {
    const source = getAtPath(dictionaries.en, keyPath);
    const translated = getAtPath(dictionaries[locale], keyPath);
    if (typeof translated !== 'string') continue;
    const sourcePlaceholders = [...source.matchAll(/\{\{[^}]+\}\}/g)].map((match) => match[0]).sort();
    const translatedPlaceholders = [...translated.matchAll(/\{\{[^}]+\}\}/g)]
      .map((match) => match[0])
      .sort();
    if (sourcePlaceholders.join(',') !== translatedPlaceholders.join(',')) {
      errors.push(`${locale}: ${keyPath} has mismatched placeholders`);
    }
  }
}

const literalPath = path.join(root, 'src', 'i18n', 'literalTranslations.json');
const literalTranslations = JSON.parse(fs.readFileSync(literalPath, 'utf8'));
for (const [source, translations] of Object.entries(literalTranslations)) {
  const sourcePlaceholders = [...source.matchAll(/\{\{\d+\}\}/g)].map((match) => match[0]).sort();
  for (const locale of locales.slice(1)) {
    if (typeof translations[locale] !== 'string' || !translations[locale].trim()) {
      errors.push(`literal ${JSON.stringify(source)} is missing ${locale}`);
      continue;
    }
    const translatedPlaceholders = [...translations[locale].matchAll(/\{\{\d+\}\}/g)]
      .map((match) => match[0])
      .sort();
    if (sourcePlaceholders.join(',') !== translatedPlaceholders.join(',')) {
      errors.push(`literal ${JSON.stringify(source)} has mismatched placeholders in ${locale}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(
  `Translation coverage complete: ${englishPaths.length} keys in ${locales.length} languages and ${Object.keys(literalTranslations).length} legacy UI literals.`,
);
