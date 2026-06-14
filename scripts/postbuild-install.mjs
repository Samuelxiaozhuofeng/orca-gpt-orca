import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const targetDir = "/Users/samdagreat/Documents/orca/plugins/orca-gpt-orca";

const files = [
  ["dist/index.js", "dist/index.js"],
  ["icon.svg", "icon.svg"],
  ["README.md", "README.md"],
  ["package.json", "package.json"],
];

await rm(targetDir, { recursive: true, force: true });

for (const [source, target] of files) {
  const targetPath = join(targetDir, target);
  await mkdir(dirname(targetPath), { recursive: true });
  await copyFile(join(rootDir, source), targetPath);
}

console.log(`Installed Orca plugin to ${targetDir}`);
