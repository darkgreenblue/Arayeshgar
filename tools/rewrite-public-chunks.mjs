/**
 * Rename Next's public `static/chunks` directory in a staged standalone bundle.
 * Some visitors to the Reza demo receive a network block-page for URLs containing
 * `chunks`, even though the homepage itself loads. `bundle` is the same byte length,
 * so replacing references also preserves offsets in generated text artifacts.
 * This runs only on the disposable staging tree, never on source or live data.
 */
import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const nextDir = resolve(process.argv[2] ?? "");
const oldDir = join(nextDir, "static", "chunks");
const newDir = join(nextDir, "static", "bundle");
const from = Buffer.from("static/chunks/");
const to = Buffer.from("static/bundle/");

if (process.argv.length !== 3 || !statSync(oldDir, { throwIfNoEntry: false })?.isDirectory()) {
  throw new Error(`Expected a built Next public chunk directory at ${oldDir}`);
}
if (statSync(newDir, { throwIfNoEntry: false })) {
  throw new Error(`Refusing to overwrite existing directory ${newDir}`);
}

let changedFiles = 0;
let replacements = 0;
function visit(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const target = join(dir, item.name);
    if (item.isDirectory()) {
      visit(target);
      continue;
    }
    if (!item.isFile()) continue;
    const contents = readFileSync(target);
    if (!contents.includes(from)) continue;
    const updated = Buffer.from(contents);
    let position = 0;
    while ((position = updated.indexOf(from, position)) !== -1) {
      to.copy(updated, position);
      position += to.length;
      replacements++;
    }
    writeFileSync(target, updated);
    changedFiles++;
  }
}

visit(nextDir);
if (replacements === 0) throw new Error("No public chunk references found in staged Next output");
renameSync(oldDir, newDir);
process.stdout.write(`Rewrote ${replacements} public asset references in ${changedFiles} files\n`);
