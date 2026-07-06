import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

type SupportedLanguage = 'es' | 'ca' | 'fa';
type TranslationEntry = Record<SupportedLanguage, string>;
type StoredMatch = {
  source: string;
  values: string[];
  lastRendered: string;
};

let translations: Record<string, TranslationEntry> = {};
let translationsLoaded = false;
let translationsPromise: Promise<void> | null = null;
const translatedAttributes = ['placeholder', 'title', 'aria-label', 'alt'] as const;
const textMatches = new WeakMap<Text, StoredMatch>();
const attributeMatches = new WeakMap<Element, Map<string, StoredMatch>>();

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let patternTranslations: Array<{ source: string; expression: RegExp }> = [];

function loadTranslations() {
  translationsPromise ??= import('./literalTranslations.json').then((module) => {
    translations = module.default as Record<string, TranslationEntry>;
    patternTranslations = Object.keys(translations)
      .filter((source) => /\{\{\d+\}\}/.test(source))
      .map((source) => {
        const parts = source.split(/(\{\{\d+\}\})/g);
        const expression = parts
          .map((part) => (/^\{\{\d+\}\}$/.test(part) ? '(.*?)' : escapeRegExp(part)))
          .join('');
        return { source, expression: new RegExp(`^${expression}$`) };
      })
      .sort((a, b) => b.source.length - a.source.length);
    translationsLoaded = true;
  });
  return translationsPromise;
}

function findSource(value: string): Omit<StoredMatch, 'lastRendered'> | null {
  if (translations[value]) return { source: value, values: [] };

  for (const pattern of patternTranslations) {
    const match = value.match(pattern.expression);
    if (match) return { source: pattern.source, values: match.slice(1) };
  }

  return null;
}

function renderMatch(match: StoredMatch, language: string) {
  const locale = language.split('-')[0] as SupportedLanguage | 'en';
  const template = locale === 'en' ? match.source : translations[match.source]?.[locale] ?? match.source;
  return template.replace(/\{\{(\d+)\}\}/g, (_placeholder, index: string) => {
    return match.values[Number(index)] ?? '';
  });
}

function preserveOuterWhitespace(original: string, replacement: string) {
  const leading = original.match(/^\s*/)?.[0] ?? '';
  const trailing = original.match(/\s*$/)?.[0] ?? '';
  return `${leading}${replacement}${trailing}`;
}

function translateTextNode(node: Text, language: string) {
  const rawValue = node.nodeValue ?? '';
  const currentValue = normalize(rawValue);
  if (!currentValue) return;

  let stored = textMatches.get(node);
  if (!stored || currentValue !== stored.lastRendered) {
    const detected = findSource(currentValue);
    if (!detected) {
      textMatches.delete(node);
      return;
    }
    stored = { ...detected, lastRendered: currentValue };
    textMatches.set(node, stored);
  }

  const replacement = renderMatch(stored, language);
  stored.lastRendered = replacement;
  if (currentValue !== replacement) {
    node.nodeValue = preserveOuterWhitespace(rawValue, replacement);
  }
}

function translateAttribute(element: Element, attribute: string, language: string) {
  const rawValue = element.getAttribute(attribute);
  if (!rawValue) return;

  const currentValue = normalize(rawValue);
  let elementMatches = attributeMatches.get(element);
  let stored = elementMatches?.get(attribute);

  if (!stored || currentValue !== stored.lastRendered) {
    const detected = findSource(currentValue);
    if (!detected) {
      elementMatches?.delete(attribute);
      return;
    }
    stored = { ...detected, lastRendered: currentValue };
    elementMatches ??= new Map();
    elementMatches.set(attribute, stored);
    attributeMatches.set(element, elementMatches);
  }

  const replacement = renderMatch(stored, language);
  stored.lastRendered = replacement;
  if (currentValue !== replacement) element.setAttribute(attribute, replacement);
}

function translateTree(root: Node, language: string) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text, language);
    return;
  }

  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const element = root as Element;
  translatedAttributes.forEach((attribute) => translateAttribute(element, attribute, language));

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    translateTextNode(current as Text, language);
    current = walker.nextNode();
  }

  element.querySelectorAll('*').forEach((child) => {
    translatedAttributes.forEach((attribute) => translateAttribute(child, attribute, language));
  });
}

/**
 * Translates legacy interface literals that have not yet been migrated to t().
 * New code should continue to use react-i18next directly; this bridge keeps the
 * older pages language-complete while they are migrated incrementally.
 */
export function LiteralTranslationBridge() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';

  useEffect(() => {
    let disposed = false;
    let observer: MutationObserver | undefined;

    async function start() {
      const locale = language.split('-')[0];
      if (locale !== 'en') await loadTranslations();
      else if (!translationsLoaded) return;
      if (disposed) return;

      const root = document.body;
      const observerOptions: MutationObserverInit = {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: [...translatedAttributes],
      };
      observer = new MutationObserver((mutations) => {
        observer?.disconnect();
        mutations.forEach((mutation) => {
          if (mutation.type === 'characterData') {
            translateTextNode(mutation.target as Text, language);
          } else if (mutation.type === 'attributes') {
            translateAttribute(mutation.target as Element, mutation.attributeName ?? '', language);
          } else {
            mutation.addedNodes.forEach((node) => translateTree(node, language));
          }
        });
        observer?.observe(root, observerOptions);
      });

      translateTree(root, language);
      observer.observe(root, observerOptions);
    }

    void start();
    return () => {
      disposed = true;
      observer?.disconnect();
    };
  }, [language]);

  return null;
}
