import { readFile } from "node:fs/promises";
import * as prettier from "/tooling/node_modules/prettier/index.mjs";

const files = {};
for (const path of process.argv.slice(2)) {
  if (
    path !== "src/lib/shoplite.ts" &&
    !/^tests\/[\w.-]+\.test\.ts$/.test(path)
  ) {
    throw new Error(
      "The formatter only accepts the measured source and regression.",
    );
  }
  files[path] = await prettier.format(await readFile(path, "utf8"), {
    filepath: path,
  });
}
process.stdout.write(JSON.stringify(files));
