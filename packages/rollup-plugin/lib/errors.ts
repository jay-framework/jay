import * as ts from 'typescript';

export function withOriginalTrace<T extends Error>(error: T, originalError: Error): T {
    error.stack = `${error.stack}\nCaused by\n${originalError.stack}`;
    return error;
}

export function checkValidationErrors(validations: string[]): void {
    if (validations.length > 0) {
        throw new Error(validations.join('\n'));
    }
}

export function checkCodeErrors(code: string): void {
    if (code.length === 0) throw new Error('Empty code');
}

export function checkDiagnosticsErrors(tsCode: ts.TransformationResult<ts.SourceFile>) {
    if (tsCode.diagnostics.length > 0) {
        throw new Error(
            `typescript transpilation failed ${tsCode.diagnostics
                .map((diagnostic) => diagnostic.toString())
                .join('\n')}`,
        );
    }
}
