export const DEFAULT_MODEL = 'gemini-3.6-flash';

export function textFromParts(parts) {
  return parts.filter((part) => part.text).map((part) => part.text).join('\n').trim();
}
