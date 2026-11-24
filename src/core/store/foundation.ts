import * as nodeFs from 'node:fs';
import * as path from 'node:path';
import {
  folderStyleNameProblem,
  isKebabId,
  KEBAB_ID_DESCRIPTION,
  KEBAB_ID_FIX,
} from '../id.js';

import { getGlobalDataDir } from '../global-config.js';
import { FileSystemUtils } from '../../utils/file-system.js';
import {
  acquireFileLock,
  isNodeErrorCode,
  makeLockErrorFactory,
  pathIsDirectory,
  pathIsFile,
  releaseFileLock,
  writeFileAtomically,
} from '../file-state.js';
import { StoreError } from './errors.js';

const fs = nodeFs.promises;

// yaml and zod load only when a store state file is read or written; see
// state-codec.ts.
function loadStateCodec(): Promise<typeof import('./state-codec.js')> {
  return import('./state-codec.js');
}

export const STORE_METADATA_DIR_NAME = '.openspec-store';
export const STORE_METADATA_FILE_NAME = 'store.yaml';
export const STORES_DIR_NAME = 'stores';
export const STORE_REGISTRY_FILE_NAME = 'registry.yaml';

export interface StorePathOptions {
  globalDataDir?: string;
}

export interface StoreGitBackendConfig {
  type: 'git';
  local_path: string;
  remote?: string;
  branch?: string;
}

export type StoreBackendConfig = StoreGitBackendConfig;

export interface StoreRegistryEntryState {
  backend: StoreBackendConfig;
}

export interface StoreRegistryState {
  version: 1;
  stores: Record<string, StoreRegistryEntryState>;
}

export interface StoreRegistryEntry {
  id: string;
  backend: StoreBackendConfig;
}

export interface StoreMetadataState {
  version: 1;
  id: string;
  /** Canonical clone source, team-authored. Optional (slice 3.3). */
  remote?: string;
}

export interface ResolveGitStoreBackendInput {
  localPath: string;
  remote?: string;
  branch?: string;
}

function joinStorePath(basePath: string, ...segments: string[]): string {
  return FileSystemUtils.joinPath(basePath, ...segments);
}

export function getStoresDir(options: StorePathOptions = {}): string {
  return joinStorePath(options.globalDataDir ?? getGlobalDataDir(), STORES_DIR_NAME);
}

export function getStoreRegistryPath(options: StorePathOptions = {}): string {
  return joinStorePath(getStoresDir(options), STORE_REGISTRY_FILE_NAME);
}

export function getStoreMetadataDir(storeRoot: string): string {
  return joinStorePath(storeRoot, STORE_METADATA_DIR_NAME);
}

export function getStoreMetadataPath(storeRoot: string): string {
  return joinStorePath(
    getStoreMetadataDir(storeRoot),
    STORE_METADATA_FILE_NAME
  );
}

export function validateStoreId(id: string): string {
  const folderProblem = folderStyleNameProblem(id, 'Store id');
  if (folderProblem !== null) {
    throw new StoreError(folderProblem, 'invalid_store_id', {
      target: 'store.id',
      fix: KEBAB_ID_FIX,
    });
  }

  if (!isKebabId(id)) {
    throw new StoreError(
      `Store id ${KEBAB_ID_DESCRIPTION}`,
      'invalid_store_id',
      {
        target: 'store.id',
        fix: KEBAB_ID_FIX,
      }
    );
  }

  return id;
}

export function isValidStoreId(id: string): boolean {
  try {
    validateStoreId(id);
    return true;
  } catch {
    return false;
  }
}

function isFileNotFoundError(error: unknown): boolean {
  return isNodeErrorCode(error, 'ENOENT');
}

function normalizeExistingPathForStorage(existingPath: string): string {
  return FileSystemUtils.canonicalizeExistingPath(existingPath);
}

export function listStoreRegistryEntries(
  registry: StoreRegistryState
): StoreRegistryEntry[] {
  return Object.entries(registry.stores)
    .map(([id, store]) => ({ id, backend: store.backend }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function isStoreRoot(candidateRoot: string): Promise<boolean> {
  return pathIsFile(getStoreMetadataPath(candidateRoot));
}

export async function readStoreRegistryState(
  options: StorePathOptions = {}
): Promise<StoreRegistryState | null> {
  const registryPath = getStoreRegistryPath(options);

  if (!(await pathIsFile(registryPath))) {
    return null;
  }

  const content = await fs.readFile(registryPath, 'utf-8');
  const { parseStoreRegistryState } = await loadStateCodec();
  return parseStoreRegistryState(content);
}

export async function writeStoreRegistryState(
  state: StoreRegistryState,
  options: StorePathOptions = {}
): Promise<void> {
  const { serializeStoreRegistryState } = await loadStateCodec();
  await writeFileAtomically(
    getStoreRegistryPath(options),
    serializeStoreRegistryState(state)
  );
}

const storeRegistryLockError = makeLockErrorFactory({
  createSubject: 'the registry lock file',
  busyMessage: 'Store registry is busy.',
  code: 'store_registry_busy',
  target: 'store.registry',
});

export async function updateStoreRegistryState(
  updater: (
    state: StoreRegistryState | null
  ) => StoreRegistryState | Promise<StoreRegistryState>,
  options: StorePathOptions = {}
): Promise<StoreRegistryState> {
  const registryPath = getStoreRegistryPath(options);
  const lockPath = `${registryPath}.lock`;
  const lock = await acquireFileLock({
    lockPath,
    errorFor: storeRegistryLockError,
  });

  try {
    const next = await updater(await readStoreRegistryState(options));
    await writeStoreRegistryState(next, options);
    return next;
  } finally {
    await releaseFileLock(lock, lockPath);
  }
}

export async function readStoreMetadataState(
  storeRoot: string
): Promise<StoreMetadataState> {
  const content = await fs.readFile(getStoreMetadataPath(storeRoot), 'utf-8');
  const { parseStoreMetadataState } = await loadStateCodec();
  return parseStoreMetadataState(content);
}

export async function readOptionalStoreMetadataState(
  storeRoot: string
): Promise<StoreMetadataState | null> {
  try {
    return await readStoreMetadataState(storeRoot);
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

export async function writeStoreMetadataState(
  storeRoot: string,
  state: StoreMetadataState
): Promise<void> {
  const { serializeStoreMetadataState } = await loadStateCodec();
  await FileSystemUtils.writeFile(
    getStoreMetadataPath(storeRoot),
    serializeStoreMetadataState(state)
  );
}

export async function resolveGitStoreBackendConfig(
  input: ResolveGitStoreBackendInput,
  cwd = process.cwd()
): Promise<StoreGitBackendConfig> {
  if (input.localPath.length === 0) {
    throw new Error('Store local path must not be empty.');
  }

  const resolvedPath = path.isAbsolute(input.localPath)
    ? path.resolve(input.localPath)
    : path.resolve(cwd, input.localPath);

  if (!(await pathIsDirectory(resolvedPath))) {
    throw new Error(`Store local path does not exist: ${input.localPath}`);
  }

  if (input.remote !== undefined && input.remote.length === 0) {
    throw new Error('Store backend remote must not be empty when provided.');
  }

  if (input.branch !== undefined && input.branch.length === 0) {
    throw new Error('Store branch must not be empty when provided.');
  }

  return {
    type: 'git',
    local_path: normalizeExistingPathForStorage(resolvedPath),
    ...(input.remote ? { remote: input.remote } : {}),
    ...(input.branch ? { branch: input.branch } : {}),
  };
}
