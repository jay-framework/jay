import replace from 'replace-in-file';
import fs from 'node:fs';

// allow using the d.ts externally without manually specifying the type override
const options = {
    files: 'dist/index.d.ts',
    from: "declare module './element-types'",
    to: "declare module '@jay-framework/runtime'",
};

export async function fixDts() {
    if (fs.existsSync(options.files)) {
        await replace(options);
    }
}

fixDts();
