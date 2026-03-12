export function parseLimit(value: string | null | undefined): number {
  if (!value) {
    return 50;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 100) {
    throw new Error("limit must be a number between 1 and 100");
  }

  return parsed;
}

export function parseAfterSequence(value: string): string {
  if (value.trim() === "") {
    throw new Error("afterSequence must be a non-negative integer");
  }

  if (!/^\d+$/.test(value)) {
    throw new Error("afterSequence must be a non-negative integer");
  }

  return value;
}
