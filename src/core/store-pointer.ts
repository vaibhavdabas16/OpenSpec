// Reading the `store:` pointer from openspec/config.yaml, and classifying an
// openspec/ directory. Root selection runs this for every command inside a
// project, so it stays free of zod: readProjectConfig in project-config.ts
// owns full config validation.
import { existsSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { parse as parseYaml } from 'yaml';

import { getStoreMetadataPath } from './store/foundation.js';

// -----------------------------------------------------------------------------
// Store pointer (declared default store)
// -----------------------------------------------------------------------------

export interface StorePointerRead {
  /** The declared store id, when present and a string. */
  value?: string;
  /** Set when the pointer cannot be trusted: the config file could not be
   * read as YAML, or the store key is present but not a string. An empty
   * or comments-only config is NOT malformed - it simply has no pointer. */
  malformed?: 'unparseable' | 'non_string';
  /** Absolute path of the config file actually read, or null when none exists. */
  filePath: string | null;
}

/**
 * Warning-silent targeted read of the `store:` pointer. Used by root
 * resolution (which must not re-emit the resilient parser's field
 * warnings) and by `openspec init`'s pointer guard. Unlike
 * `readProjectConfig`, a malformed value is REPORTED, not dropped —
 * a dropped pointer would silently flip where work lands.
 */
export function readStorePointer(projectRoot: string): StorePointerRead {
  const configPath = resolveConfigFilePath(projectRoot);
  if (configPath === null) {
    return { filePath: null };
  }

  try {
    const raw = parseYaml(readFileSync(configPath, 'utf-8'));
    // Empty, comments-only, or non-mapping configs carry no pointer;
    // they are imperfect, not malformed (readProjectConfig owns the
    // field warnings for those).
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { filePath: configPath };
    }
    const value = (raw as Record<string, unknown>).store;
    if (value === undefined) {
      return { filePath: configPath };
    }
    if (typeof value === 'string') {
      return { value, filePath: configPath };
    }
    return { malformed: 'non_string', filePath: configPath };
  } catch {
    return { malformed: 'unparseable', filePath: configPath };
  }
}

/** Shared .yaml/.yml probe used by readProjectConfig and readStorePointer. */
export function resolveConfigFilePath(projectRoot: string): string | null {
  const yamlPath = path.join(projectRoot, 'openspec', 'config.yaml');
  if (existsSync(yamlPath)) {
    return yamlPath;
  }
  const ymlPath = path.join(projectRoot, 'openspec', 'config.yml');
  return existsSync(ymlPath) ? ymlPath : null;
}

/** Human rendering of a malformed pointer reason, shared by every surface. */
export function storePointerProblem(reason: 'unparseable' | 'non_string'): string {
  return reason === 'unparseable'
    ? 'the config file could not be read as YAML'
    : 'the store key must be a single store id string';
}

export interface OpenSpecDirClassification {
  /**
   * True when openspec/specs or openspec/changes exists as a directory
   * that is not itself a store root.
   */
  hasPlanningShape: boolean;
  pointer: StorePointerRead;
}

/**
 * One classification for "real root vs config-only pointer dir", shared
 * by root resolution and the init pointer guard so they can never
 * disagree (slice 3.2).
 *
 * A specs/ or changes/ directory carrying store metadata is a store at
 * the recommended `~/openspec/<id>` layout whose id is `specs` or
 * `changes`, not planning content of the directory above it. Counting it
 * would make $HOME the phantom root the qualifying walk exists to prevent.
 */
export function classifyOpenSpecDir(projectRoot: string): OpenSpecDirClassification {
  const openspecDir = path.join(projectRoot, 'openspec');
  const hasPlanningShape =
    isPlanningDirectorySync(path.join(openspecDir, 'specs')) ||
    isPlanningDirectorySync(path.join(openspecDir, 'changes'));
  return { hasPlanningShape, pointer: readStorePointer(projectRoot) };
}

function isPlanningDirectorySync(candidatePath: string): boolean {
  return isDirectorySync(candidatePath) && !existsSync(getStoreMetadataPath(candidatePath));
}

function isDirectorySync(candidatePath: string): boolean {
  try {
    return statSync(candidatePath).isDirectory();
  } catch {
    return false;
  }
}
