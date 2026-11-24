// Parsing and serializing the store registry and store metadata files. This
// is the only part of the store foundation that needs yaml and zod, so it
// lives in its own module and loads on demand: every command run inside a
// project imports foundation.ts for its paths, and most never read a store
// state file.
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { z } from 'zod';
import { isKebabId, KEBAB_ID_DESCRIPTION } from '../id.js';
import { formatZodIssues } from '../zod-issues.js';
import { StoreError } from './errors.js';
import {
  getStoreRegistryPath,
  validateStoreId,
  type StoreMetadataState,
  type StoreRegistryState,
} from './foundation.js';

function nonEmptyOptionalString() {
  return z.string().min(1).optional();
}

const GitBackendConfigSchema = z.object({
  type: z.literal('git'),
  local_path: z.string().min(1),
  remote: nonEmptyOptionalString(),
  branch: nonEmptyOptionalString(),
}).strict();

const RegistryEntrySchema = z.object({
  backend: GitBackendConfigSchema,
}).strict();

const RegistryStateSchema = z.object({
  version: z.literal(1),
  stores: z.record(z.string(), RegistryEntrySchema),
  // Legacy code-checkout map data is tolerated on read and dropped on
  // the next write.
  repos: z.unknown().optional(),
}).strict();

const MetadataStateSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  remote: nonEmptyOptionalString(),
}).strict();

function storeStateDiagnostic(label: string): {
  code: string;
  target: string;
  fix: string;
} {
  if (label.includes('metadata')) {
    return {
      code: 'invalid_store_metadata',
      target: 'store.metadata',
      fix: 'Repair .openspec-store/store.yaml.',
    };
  }

  return {
    code: 'invalid_store_registry',
    target: 'store.registry',
    fix: `Repair or remove ${getStoreRegistryPath({})}.`,
  };
}

function invalidStoreStateError(label: string, message: string): StoreError {
  const diagnostic = storeStateDiagnostic(label);
  return new StoreError(`Invalid ${label}: ${message}`, diagnostic.code, {
    target: diagnostic.target,
    fix: diagnostic.fix,
  });
}

function parseYamlObject(content: string, label: string): unknown {
  try {
    return parseYaml(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw invalidStoreStateError(label, message);
  }
}

function assertValidStoreIds(ids: string[], label: string): void {
  for (const id of ids) {
    if (!isKebabId(id)) {
      throw invalidStoreStateError(
        label,
        `'${id}': ${KEBAB_ID_DESCRIPTION}`
      );
    }
  }
}

export function parseStoreRegistryState(content: string): StoreRegistryState {
  const raw = parseYamlObject(content, 'store registry state');
  const result = RegistryStateSchema.safeParse(raw);

  if (!result.success) {
    throw invalidStoreStateError(
      'store registry state',
      formatZodIssues(result.error)
    );
  }

  assertValidStoreIds(Object.keys(result.data.stores), 'store id');

  return {
    version: 1,
    stores: result.data.stores,
  };
}

export function parseStoreMetadataState(content: string): StoreMetadataState {
  const raw = parseYamlObject(content, 'store metadata state');
  const result = MetadataStateSchema.safeParse(raw);

  if (!result.success) {
    throw invalidStoreStateError(
      'store metadata state',
      formatZodIssues(result.error)
    );
  }

  validateStoreId(result.data.id);

  return {
    version: 1,
    id: result.data.id,
    ...(result.data.remote !== undefined ? { remote: result.data.remote } : {}),
  };
}

export function serializeStoreRegistryState(state: StoreRegistryState): string {
  const result = RegistryStateSchema.safeParse(state);

  if (!result.success) {
    throw invalidStoreStateError(
      'store registry state',
      formatZodIssues(result.error)
    );
  }

  assertValidStoreIds(Object.keys(result.data.stores), 'store id');

  return stringifyYaml({
    version: 1,
    stores: result.data.stores,
  });
}

export function serializeStoreMetadataState(state: StoreMetadataState): string {
  const result = MetadataStateSchema.safeParse(state);

  if (!result.success) {
    throw invalidStoreStateError(
      'store metadata state',
      formatZodIssues(result.error)
    );
  }

  validateStoreId(result.data.id);

  return stringifyYaml({
    version: 1,
    id: result.data.id,
    ...(result.data.remote !== undefined ? { remote: result.data.remote } : {}),
  });
}
