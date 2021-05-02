import { promises as fs } from 'fs';
import { generateDefinitionFile } from 'jay-compiler';
import path from 'path';

async function run() {
  let dir = process.argv[2];
  console.log(dir);
  let allFiles = await fs.readdir(dir);
  console.log(allFiles);
  const jayFiles = allFiles.filter(
    (_) => _.indexOf('.jay.html') === _.length - 9 && _.indexOf('.jay.html') > 0
  );
  console.log(jayFiles);
  for (const jayFile of jayFiles) {
    const content = await fs.readFile(path.join(dir, jayFile));
    console.log(content);
    const d = generateDefinitionFile(content);
    console.log(d);
    console.log(path.join(dir, jayFile + '.d.ts'));
    await fs.writeFile(path.join(dir, jayFile + '.d.ts'), d.val);
  }
}

run();
