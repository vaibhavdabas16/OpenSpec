#!/usr/bin/env node

import { execFileSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const resolveTsc = () => {
  try {
    return require.resolve('typescript/bin/tsc');
  } catch {
    return undefined;
  }
};

const runTsc = (tscPath, args = []) => {
  execFileSync(process.execPath, [tscPath, ...args], { stdio: 'inherit' });
};

console.log('🔨 Building OpenSpec...\n');

const tscPath = resolveTsc();

// `npm install --omit=dev` in a checkout of this repo still runs `prepare`,
// but leaves TypeScript out. Tools that install git packages that way, such as
// the Pi coding agent, only need the checkout's files (for example skills/),
// so skip the build instead of failing the whole install. Packing and
// publishing still fail below, so a package is never built without dist/.
const isInstall = ['install', 'ci'].includes(process.env.npm_command ?? '');
if (tscPath === undefined && isInstall) {
  console.warn(
    '⚠️  Skipping the build: TypeScript is not installed, which happens when\n' +
      '   dev dependencies are omitted. Run a full install to build the CLI.'
  );
  process.exit(0);
}

// Clean dist directory
if (existsSync('dist')) {
  console.log('Cleaning dist directory...');
  rmSync('dist', { recursive: true, force: true });
}

// Run TypeScript compiler (use local version explicitly)
console.log('Compiling TypeScript...');
try {
  if (tscPath === undefined) {
    throw new Error('TypeScript is not installed');
  }
  runTsc(tscPath, ['--version']);
  runTsc(tscPath);
  console.log('\n✅ Build completed successfully!');
} catch (error) {
  console.error('\n❌ Build failed!');
  process.exit(1);
}
