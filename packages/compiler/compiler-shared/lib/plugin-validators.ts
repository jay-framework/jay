export interface JayHtmlValidationFinding {
    severity: 'error' | 'warning';
    message: string;
    suggestion?: string;
    element?: string;
    attribute?: string;
}

export interface JayHtmlValidationContext {
    body: any;
    filePath: string;
    projectRoot: string;
    contract?: {
        name: string;
        tags: Array<{
            tag: string;
            type: number[];
            meta?: Record<string, string>;
            tags?: any[];
            repeated?: boolean;
            [key: string]: any;
        }>;
        props?: Array<{ name: string; required?: boolean; [key: string]: any }>;
        params?: Array<{ name: string; kind: string }>;
    };
    headlessImports: Array<{
        key?: string;
        contractName: string;
        contract?: JayHtmlValidationContext['contract'];
    }>;
}

export type JayHtmlValidatorFn = (
    context: JayHtmlValidationContext,
) => JayHtmlValidationFinding[] | Promise<JayHtmlValidationFinding[]>;
