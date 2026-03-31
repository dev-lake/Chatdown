import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const artifactsDir = path.join(rootDir, 'artifacts');

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
  const packageJsonPath = path.join(rootDir, 'package.json');
  const packageJson = await readFile(packageJsonPath, 'utf8');

  return JSON.parse(packageJson);
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

  const { name, version } = await readPackageInfo();
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
