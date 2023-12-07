import * as ts from "typescript";
import {CompilerOptions, ModuleKind, ModuleResolutionKind, ScriptTarget} from "typescript";
import {mkTransformer} from "../../lib/ts-file/mk-transformer.ts";
import {findJayComponentConstructor} from "../../lib/ts-file/find-jay-component-constructor.ts";

describe('find jay component constructor', () => {
    it('transform counter component', async () => {

        const compilerOptions: CompilerOptions = {
            "target": ScriptTarget.ES2022,
            "module": ModuleKind.ES2022,
            "skipLibCheck": true,
            "moduleResolution": ModuleResolutionKind.Bundler,
            "useDefineForClassFields": true,
            "resolveJsonModule": true,
            "isolatedModules": true,
            "lib": ["ES2020", "DOM"],

        }

        const dir = './test/fixtures/components/counter/'
        let host: ts.CompilerHost = {
            writeFile: (fileName, content) => ts.sys.writeFile(fileName, content),
            fileExists(fileName: string): boolean {
                return ts.sys.fileExists(fileName);
            },
            getCanonicalFileName: fileName =>
                ts.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase(),
            getCurrentDirectory:() => ts.sys.getCurrentDirectory(),
            getDefaultLibFileName: () => "lib.d.ts",
            getNewLine: () => ts.sys.newLine,
            getSourceFile(fileName: string, languageVersion: ts.ScriptTarget | ts.CreateSourceFileOptions, onError?: (message: string) => void, shouldCreateNewSourceFile?: boolean): ts.SourceFile | undefined {
                let sourceText;
                if (fileName === 'ES2020.ts')
                    sourceText = ts.sys.readFile('../../node_modules/typescript/lib/lib.es2020.d.ts');
                else if (fileName === 'DOM.ts')
                    sourceText = ts.sys.readFile('../../node_modules/typescript/lib/lib.dom.d.ts');
                else
                    sourceText = ts.sys.readFile(fileName);

                if (sourceText === undefined)
                    sourceText = ts.sys.readFile('../../node_modules/typescript/lib/' + fileName);

                return sourceText !== undefined
                    ? ts.createSourceFile(fileName, sourceText, languageVersion)
                    : undefined;
            },
            readFile(fileName: string): string | undefined {
                return ts.sys.readFile(fileName);
            },
            useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames
        }

        const callback = vi.fn();

        // const sourceFile = await readTsSourceFile('components/counter', 'counter.ts');
        const program = ts.createProgram(['./test/fixtures/components/counter/counter.ts'],  compilerOptions, host)
        const sourceFile = program.getSourceFile('./test/fixtures/components/counter/counter.ts');
        const checker = program.getTypeChecker()
        const emitResult = program.emit(sourceFile, undefined, undefined, undefined, {
            before: [mkTransformer({callback, checker}, findJayComponentConstructor)]
        })
        // const outputFile = ts.transform(sourceFile, [
        //     mkTransformer({callback, checker}, findJayComponentConstructor)        ]);

        let allDiagnostics = ts
            .getPreEmitDiagnostics(program)
            .concat(emitResult.diagnostics);

        allDiagnostics.forEach(diagnostic => {
            if (diagnostic.file) {
                let { line, character } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start!);
                let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
                console.log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
            } else {
                console.log(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
            }
        });
        expect(callback).toHaveBeenCalled();
    });
});
