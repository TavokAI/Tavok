function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getDmListFromResponse<T>(response: unknown): T[] {
  if (!isRecord(response) || !Array.isArray(response.dms)) {
    return [];
  }

  return response.dms as T[];
}

export function getCreatedDmIdFromResponse(response: unknown): string | null {
  if (!isRecord(response) || !isRecord(response.dm)) {
    return null;
  }

  return typeof response.dm.id === "string" ? response.dm.id : null;
}
