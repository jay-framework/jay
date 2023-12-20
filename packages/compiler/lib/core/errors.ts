import * as ts from 'typescript';
import { WithValidations } from './with-validations';

export function checkValidationErrors<T>(withValidations: WithValidations<T>): T {
    const { validations } = withValidations;
    if (validations.length > 0) {
        throw new Error(validations.join('\n'));
    }
    return withValidations.val!;
}

export function checkCodeErrors(code: string): string {
    if (code.length === 0) throw new Error('Empty code');
    return code;
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
