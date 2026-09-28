/**
 * User-facing term for the PG domain entity. The API/domain layer keeps the
 * MRD name (`Pg`, `pgId`, `createPg`, …) — users should never see "PG" in the
 * interface. Read display terms from here so the noun can change in one place.
 */
export const PROPERTY_TERM = {
  singular: 'Property',
  plural: 'Properties',
  singularLower: 'property',
  pluralLower: 'properties'
} as const;
