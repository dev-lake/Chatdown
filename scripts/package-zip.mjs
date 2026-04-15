import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const artifactsDir = path.join(rootDir, 'artifacts');
const packageJsonPath = path.join(rootDir, 'package.json');
const packageLockPath = path.join(rootDir, 'package-lock.json');
const manifestPath = path.join(rootDir, 'public', 'manifest.json');
const distManifestPath = path.join(distDir, 'manifest.json');

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

async function readPackageInfo() {
  const packageJson = await readFile(packageJsonPath, 'utf8');

  return JSON.parse(packageJson);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function isValidExtensionVersion(version) {
  if (!/^\d+(?:\.\d+){0,3}$/.test(version)) {
    return false;
  }

  return version
    .split('.')
    .every((part) => Number.parseInt(part, 10) <= 65535);
}

async function promptForVersion(currentVersion) {
  if (!input.isTTY || !output.isTTY) {
    return currentVersion;
  }

  const rl = createInterface({ input, output });

  try {
    while (true) {
      const answer = await rl.question(`Extension version [${currentVersion}]: `);
      const nextVersion = answer.trim() || currentVersion;

      if (isValidExtensionVersion(nextVersion)) {
        return nextVersion;
      }

      console.error('Invalid version. Use 1 to 4 numeric parts, e.g. 1.0.1 or 1.2.3.');
    }
  } finally {
    rl.close();
  }
}

async function syncVersion(nextVersion) {
  const packageJson = await readJson(packageJsonPath);
  const packageLock = await readJson(packageLockPath);
  const manifest = await readJson(manifestPath);

  packageJson.version = nextVersion;
  packageLock.version = nextVersion;
  if (packageLock.packages?.['']) {
    packageLock.packages[''].version = nextVersion;
  }
  manifest.version = nextVersion;

  await writeJson(packageJsonPath, packageJson);
  await writeJson(packageLockPath, packageLock);
  await writeJson(manifestPath, manifest);

  try {
    const distManifest = await readJson(distManifestPath);
    distManifest.version = nextVersion;
    await writeJson(distManifestPath, distManifest);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function createZipArchive(outputPath) {
  await mkdir(artifactsDir, { recursive: true });
  await rm(outputPath, { force: true });

  await new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    output.on('close', resolve);
    output.on('error', reject);

    archive.on('warning', (error) => {
      if (error.code === 'ENOENT') {
        return;
      }

      reject(error);
    });

    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(distDir, false);
    archive.finalize();
  });
}

async function main() {
  await access(distDir);

  const currentPackageInfo = await readPackageInfo();
  const version = await promptForVersion(currentPackageInfo.version);

  if (version !== currentPackageInfo.version) {
    await syncVersion(version);
    console.log(`Updated version to ${version}`);
  }

  const { name } = await readPackageInfo();
  const zipFileName = `${name}-v${version}.zip`;
  const outputPath = path.join(artifactsDir, zipFileName);

  await createZipArchive(outputPath);

  const archiveStats = await stat(outputPath);
  const relativeOutputPath = path.relative(rootDir, outputPath);

  console.log(`Created ${relativeOutputPath} (${formatBytes(archiveStats.size)})`);
}

main().catch((error) => {
  if (error?.code === 'ENOENT') {
    console.error('dist/ not found. Run "npm run build" or "npm run build:zip" first.');
  } else {
    console.error(error);
  }

  process.exit(1);
});
