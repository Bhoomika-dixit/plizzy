export function resolveText(texts: Record<string, string>, key: string, fallback: string, values: Record<string, string | number> = {}) {
  const source = texts[key] || fallback;
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), source);
}

export const textImplementations = { named_text_resolver: resolveText } as const;
