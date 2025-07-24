import { createRequire } from 'module';
import type * as ts from 'typescript';
const require = createRequire(import.meta.url);
const tsModule = require('typescript') as typeof ts;
const {
    ModuleKind,
    ModuleResolutionKind,
    ScriptTarget,
    sys,
    createSourceFile,
    createProgram,
    getPreEmitDiagnostics,
    getLineAndCharacterOfPosition,
    flattenDiagnosticMessageText,
} = tsModule;

const compilerOptions: ts.CompilerOptions = {
    target: ScriptTarget.ES2022,
    module: ModuleKind.ES2022,
    skipLibCheck: true,
    moduleResolution: ModuleResolutionKind.Bundler,
    useDefineForClassFields: true,
    resolveJsonModule: true,
    isolatedModules: true,
    lib: ['ES2020', 'DOM'],
};

let host: ts.CompilerHost = {
    writeFile: (fileName, content) => sys.writeFile(fileName, content),
    fileExists(fileName: string): boolean {
        return sys.fileExists(fileName);
    },
    getCanonicalFileName: (fileName) =>
        sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase(),
    getCurrentDirectory: () => sys.getCurrentDirectory(),
    getDefaultLibFileName: () => 'lib.d.ts',
    getNewLine: () => sys.newLine,
    getSourceFile(
        fileName: string,
        languageVersion: ts.ScriptTarget | ts.CreateSourceFileOptions,
        onError?: (message: string) => void,
        shouldCreateNewSourceFile?: boolean,
    ): ts.SourceFile | undefined {
        let sourceText;
        if (fileName === 'ES2020.ts')
            sourceText = sys.readFile('../../node_modules/typescript/lib/lib.es2020.d.ts');
        else if (fileName === 'DOM.ts')
            sourceText = sys.readFile('../../node_modules/typescript/lib/lib.dom.d.ts');
        else sourceText = sys.readFile(fileName);

        if (sourceText === undefined)
            sourceText = sys.readFile('../../node_modules/typescript/lib/' + fileName);

        return sourceText !== undefined
            ? createSourceFile(fileName, sourceText, languageVersion)
            : undefined;
    },
    readFile(fileName: string): string | undefined {
        return sys.readFile(fileName);
    },
    useCaseSensitiveFileNames: () => sys.useCaseSensitiveFileNames,
};

export interface TransformResult {
    diagnostics: string[];
}
export function transformFile(
    filename: string,
    setupCustomTransformers: (
        program: ts.Program,
        checker: ts.TypeChecker,
    ) => ts.CustomTransformers,
): TransformResult {
    const program = createProgram([filename], compilerOptions, host);
    const sourceFile = program.getSourceFile(filename);
    const checker = program.getTypeChecker();
    const emitResult = program.emit(
        sourceFile,
        undefined,
        undefined,
        undefined,
        setupCustomTransformers(program, checker),
    );

    let allDiagnostics = getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

    let diagnostics = allDiagnostics.map((diagnostic) => {
        if (diagnostic.file) {
            let { line, character } = getLineAndCharacterOfPosition(
                diagnostic.file,
                diagnostic.start!,
            );
            let message = flattenDiagnosticMessageText(diagnostic.messageText, '\n');
            return `${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`;
        } else {
            return flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        }
    });

    return { diagnostics };
}
