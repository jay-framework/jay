/**
 * Public result types of the share plugin (DL#221 § "Errors and reports — one type").
 * The 7 action names and these shapes are public API.
 */

export type ShareErrorCode =
    | 'SHARE_INVALID_REPO'
    | 'SHARE_BRANCH_NOT_EMPTY'
    | 'SHARE_NO_ACCESS'
    | 'SHARE_OFFLINE'
    | 'SHARE_DIRTY'
    | 'SHARE_DIVERGED'
    | 'SHARE_BRANCH_PROTECTED'
    | 'SHARE_SUBMODULE'
    | 'SHARE_TRACKED'
    | 'SHARE_NAME_CLASH'
    | 'SHARE_FOLDER_EXISTS'
    | 'SHARE_SECRET_FOUND'
    | 'SHARE_VALIDATE_FAILED'
    | 'SHARE_NOT_IN_MANIFEST'
    | 'SHARE_ALREADY_IN_MANIFEST'
    | 'SHARE_COMMIT_MISSING'
    | 'SHARE_GIT_FAILED'
    | 'SHARE_NOT_A_PLUGIN';

export type SetupOutcome = 'none' | 'configured' | 'needs-config' | 'needs-answer' | 'error';

export interface SetupQuestion {
    key: string;
    type: string;
    message: string;
    choices?: { value: string; name: string }[];
}

export interface PluginSummary {
    name: string;
    folder: string;
    repo: string;
    sha: string;
    shortSha: string;
    contracts: string[];
    actions: string[];
    routes: string[];
    /** Plugin routes hidden by project routes with the same path. */
    shadowedRoutes: string[];
    /** Any `.ts/.tsx/.mts/.cts/.js/.jsx/.mjs/.cjs` file in the plugin (DL#221 Implementation Results). */
    hasServerCode: boolean;
    setup: SetupOutcome;
    setupMessage?: string;
    setupQuestion?: SetupQuestion;
}

export interface PluginStatus {
    folder: string;
    name?: string;
    present: boolean;
    dirtyFiles: string[];
    /** Commits in HEAD not in origin/<ref> (last fetched remote-tracking ref). */
    ahead: number;
    /** Commits in origin/<ref> not in HEAD. */
    behind: number;
    diverged: boolean;
    headSha?: string;
    pinnedSha: string;
    headMatchesPin: boolean;
    fetched: boolean;
}

export interface IncomingFiles {
    codeFiles: string[];
    otherFiles: string[];
}

export interface ShareReport {
    ok: boolean;
    code?: ShareErrorCode;
    message: string;
    files: string[];
    localSha?: string;
    remoteSha?: string;
    nextStep?: string;
    plugin?: PluginSummary;
    plugins?: PluginStatus[];
    incoming?: IncomingFiles;
}

export class ShareError extends Error {
    constructor(readonly report: ShareReport) {
        super(report.message);
        this.name = 'ShareError';
    }
}

export function shareFailure(
    code: ShareErrorCode,
    message: string,
    extra: Partial<ShareReport> = {},
): ShareError {
    return new ShareError({ ok: false, code, message, files: [], ...extra });
}
