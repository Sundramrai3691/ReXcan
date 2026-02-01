export function asString(value: any): string {
  if (Array.isArray(value)) return value[0];
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return String(value);
  return '';
}
