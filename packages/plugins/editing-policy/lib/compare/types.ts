import { Change } from '../changes/types.js';

export type Disposition = 'PUBLISH' | 'REVIEW' | 'BLOCK';

export interface Finding {
    id: string;
    source: 'rule' | 'llm' | 'validate';
    severity: 'block' | 'review' | 'info';
    ruleId: string;
    selector?: string;
    path?: string;
    section?: string;
    /** 1-based [start, end] line range in the candidate file, when the change pinpoints a part. */
    lines?: [number, number];
    message: string;
    suggestion?: string;
    role: string;
}

export interface CompareResult {
    disposition: Disposition;
    findings: Finding[];
    changes: Change[];
    policyHash: string;
}

/** Exit codes mirror the disposition (DL#231 §1.6). */
export const EXIT_CODES: Record<Disposition, number> = {
    PUBLISH: 0,
    REVIEW: 10,
    BLOCK: 11,
};
export const EXIT_TOOL_ERROR = 1;
