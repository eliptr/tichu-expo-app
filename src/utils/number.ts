export function parseInteger(value: string, fallback = 0) {
  const normalized = value.trim();

  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function formatSigned(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}
