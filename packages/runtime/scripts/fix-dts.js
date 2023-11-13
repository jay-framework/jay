import replace from 'replace-in-file';

// allow using the d.ts externally without manually specifying the type override
const options = {
    files: 'dist/index.d.ts',
    from: "declare module './element-types'",
    to: "declare module 'jay-runtime'",
};

replace(options);
