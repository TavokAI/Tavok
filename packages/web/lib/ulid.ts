import { ulid } from "ulid";

/**
 * Generate a new ULID.
 * ULIDs are time-sortable, globally unique, and 26 characters long.
 * See docs/DECISIONS.md DEC-0004.
 */
export function generateId(): string {
  return ulid();
}
