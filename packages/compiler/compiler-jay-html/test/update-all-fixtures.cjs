const fs = require('fs');
const path = require('path');
const glob = require('glob');

const testDir = __dirname;

// Find all generated-element-bridge.ts and generated-element.ts files (but not .d.ts)
const bridgeFiles = glob.sync('fixtures/**/generated-element-bridge.ts', { cwd: testDir });
const elementFiles = glob.sync('fixtures/**/generated-element.ts', { cwd: testDir });

const allFiles = [...bridgeFiles, ...elementFiles];

console.log(
  `Found ${allFiles.length} files to update (${bridgeFiles.length} bridge, ${elementFiles.length} element)`,
);

let updated = 0;
let skipped = 0;

for (const file of allFiles) {
  const fullPath = path.join(testDir, file);
  let content = fs.readFileSync(fullPath, 'utf-8');

  // Extract the component name
  const match = content.match(/export interface (\w+)ViewState/);
  if (!match) {
    console.log(`Skipping ${file} - no ViewState found`);
    skipped++;
    continue;
  }

  const baseName = match[1];

  // Check if phase types already exist
  if (content.includes(`${baseName}SlowViewState`)) {
    console.log(`Skipping ${file} - already has phase types`);
    skipped++;
    continue;
  }

  // Find where to insert phase types (after ElementRefs interface)
  const refsPattern = new RegExp(`export interface ${baseName}ElementRefs \\{[^}]*\\}`, 's');
  const refsMatch = content.match(refsPattern);

  if (!refsMatch) {
    console.log(`Skipping ${file} - no ElementRefs found`);
    skipped++;
    continue;
  }

  // Add phase types after ElementRefs
  const phaseTypes = `
export type ${baseName}SlowViewState = {};
export type ${baseName}FastViewState = {};
export type ${baseName}InteractiveViewState = ${baseName}ViewState;
`;

  content = content.replace(refsMatch[0], refsMatch[0] + '\n' + phaseTypes);

  // Update JayContract to 5 parameters
  const old2ParamPattern = new RegExp(
    `export type ${baseName}Contract = JayContract<${baseName}ViewState, ${baseName}ElementRefs>;`,
    'g',
  );

  const new5Param = `export type ${baseName}Contract = JayContract<
    ${baseName}ViewState,
    ${baseName}ElementRefs,
    ${baseName}SlowViewState,
    ${baseName}FastViewState,
    ${baseName}InteractiveViewState
>;`;

  content = content.replace(old2ParamPattern, new5Param);

  fs.writeFileSync(fullPath, content, 'utf-8');
  console.log(`✓ Updated ${file}`);
  updated++;
}

console.log(`\nDone! Updated ${updated} files, skipped ${skipped} files`);
