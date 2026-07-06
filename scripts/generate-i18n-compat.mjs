import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const srcRoot = path.join(root, 'src');
const localesRoot = path.join(srcRoot, 'i18n', 'locales');
const outputPath = path.join(srcRoot, 'i18n', 'literalTranslations.json');
const localeCodes = ['es', 'ca', 'fa'];

async function listTsxFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return listTsxFiles(target);
      return entry.isFile() && target.endsWith('.tsx') ? [target] : [];
    }),
  );
  return nested.flat();
}

function normalize(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function templateText(node) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (!ts.isTemplateExpression(node)) return null;
  return `${node.head.text}${node.templateSpans
    .map((span, index) => `{{${index}}}${span.literal.text}`)
    .join('')}`;
}

function isTranslationCall(node) {
  return (
    ts.isCallExpression(node.parent) &&
    node.parent.arguments[0] === node &&
    ts.isIdentifier(node.parent.expression) &&
    node.parent.expression.text === 't'
  );
}

function isInsideJsxExpression(node) {
  let current = node.parent;
  while (current) {
    if (ts.isJsxExpression(current)) return true;
    if (
      ts.isFunctionLike(current) ||
      ts.isSourceFile(current) ||
      ts.isBlock(current)
    ) {
      return false;
    }
    current = current.parent;
  }
  return false;
}

function isUiProperty(node) {
  if (!ts.isPropertyAssignment(node.parent)) return false;
  const name = node.parent.name;
  const propertyName = ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : '';
  return /^(label|title|description|placeholder|emptyMessage|emptyText|heading|caption|message)$/i.test(
    propertyName,
  );
}

function isToastMessage(node) {
  if (!ts.isCallExpression(node.parent) || node.parent.arguments[0] !== node) return false;
  const expression = node.parent.expression;
  return (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'toast'
  );
}

function shouldKeep(value) {
  const text = normalize(value);
  if (!text || text.length < 2 || text.length > 500 || !/[A-Za-z]/.test(text)) return false;
  if (/^(https?:|mailto:|tel:|\.\.?\/|\/)/i.test(text)) return false;
  if (/^[@#.]/.test(text) || /^[A-Za-z0-9_./-]+\.(tsx?|jsx?|css|json|svg|png|jpg)$/i.test(text)) {
    return false;
  }
  if (/^(flex|grid|block|inline|hidden|absolute|relative|fixed|sticky)(\s|$)/.test(text)) {
    return false;
  }
  if (/\b(text|bg|border|rounded|hover|focus|dark|sm|md|lg|xl)-[A-Za-z0-9_[\]/.-]+/.test(text)) {
    return false;
  }
  return true;
}

async function collectLiterals() {
  const values = new Set();
  const files = await listTsxFiles(srcRoot);

  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    function add(value) {
      if (typeof value === 'string' && shouldKeep(value)) {
        values.add(normalize(value));
      }
    }

    function visit(node) {
      if (ts.isJsxText(node)) {
        add(node.text);
      } else if (ts.isJsxAttribute(node)) {
        const attributeName = node.name.getText(sourceFile);
        if (/^(placeholder|title|aria-label|alt)$/i.test(attributeName) && node.initializer) {
          if (ts.isStringLiteral(node.initializer)) add(node.initializer.text);
          if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
            const expression = node.initializer.expression;
            if (ts.isStringLiteral(expression)) add(expression.text);
            add(templateText(expression));
          }
        }
      } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        if (!isTranslationCall(node) && (isInsideJsxExpression(node) || isUiProperty(node) || isToastMessage(node))) {
          add(node.text);
        }
      } else if (ts.isTemplateExpression(node)) {
        if (isInsideJsxExpression(node) || isUiProperty(node) || isToastMessage(node)) {
          add(templateText(node));
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return [...values].sort((a, b) => a.localeCompare(b));
}

function makeChunks(values, maxCharacters = 3500, maxItems = 40) {
  const chunks = [];
  let current = [];
  let length = 0;
  for (const value of values) {
    if (current.length && (current.length >= maxItems || length + value.length + 1 > maxCharacters)) {
      chunks.push(current);
      current = [];
      length = 0;
    }
    current.push(value);
    length += value.length + 1;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

async function translateChunk(values, target) {
  const query = encodeURIComponent(values.join('\n'));
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${target}&dt=t&q=${query}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Translation request failed (${response.status})`);
  const payload = await response.json();
  const translated = payload[0].map((segment) => segment[0]).join('').split('\n');
  if (translated.length !== values.length) {
    if (values.length === 1) return translated;
    const individual = [];
    for (const value of values) individual.push(...(await translateChunk([value], target)));
    return individual;
  }
  return translated;
}

async function translate(values, target) {
  const output = [];
  for (const chunk of makeChunks(values)) {
    output.push(...(await translateChunk(chunk, target)));
  }
  return output;
}

function collectKnownTranslations(english, localized, result = {}) {
  for (const [key, value] of Object.entries(english)) {
    if (typeof value === 'string') {
      if (localeCodes.every((locale) => typeof localized[locale]?.[key] === 'string')) {
        result[normalize(value)] = Object.fromEntries(
          localeCodes.map((locale) => [locale, localized[locale][key]]),
        );
      }
    } else {
      const children = Object.fromEntries(
        localeCodes.map((locale) => [locale, localized[locale]?.[key] ?? {}]),
      );
      collectKnownTranslations(value, children, result);
    }
  }
  return result;
}

const english = JSON.parse(await fs.readFile(path.join(localesRoot, 'en.json'), 'utf8'));
const localized = Object.fromEntries(
  await Promise.all(
    localeCodes.map(async (locale) => [
      locale,
      JSON.parse(await fs.readFile(path.join(localesRoot, `${locale}.json`), 'utf8')),
    ]),
  ),
);
const knownTranslations = collectKnownTranslations(english, localized);
const literals = await collectLiterals();
let existingTranslations = {};
try {
  existingTranslations = JSON.parse(await fs.readFile(outputPath, 'utf8'));
} catch {
  // The first run has no generated dictionary to reuse.
}
const hasEveryLocale = (entry) =>
  entry && localeCodes.every((locale) => typeof entry[locale] === 'string' && entry[locale]);
const untranslatedLiterals = literals.filter(
  (literal) => !knownTranslations[literal] && !hasEveryLocale(existingTranslations[literal]),
);
const dictionary = Object.fromEntries(
  literals.map((literal) => [
    literal,
    knownTranslations[literal] ?? existingTranslations[literal] ?? {},
  ]),
);

for (const locale of localeCodes) {
  const translated = await translate(untranslatedLiterals, locale);
  untranslatedLiterals.forEach((literal, index) => {
    dictionary[literal][locale] = translated[index].trim();
  });
}

await fs.writeFile(outputPath, `${JSON.stringify(dictionary, null, 2)}\n`);
console.log(`Generated ${literals.length} translated UI literals at ${path.relative(root, outputPath)}`);
