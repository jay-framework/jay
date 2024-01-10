const replace = require('replace-in-file');

// replaces "import ... from file.ts;" to "import ... from file;"
const options = {
    files: 'packages/**/*.ts',
    from: /from '(.+)\.ts';/g,
    to: "from '$1';",
};

async function fixImportsTsExtension() {
    await replace(options);
}

fixImportsTsExtension();
