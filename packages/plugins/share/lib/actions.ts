/**
 * The 7 devOnly `share*` actions (DL#237 TL;DR #8) — the typed programmatic surface. Names are
 * prefixed because the action registry overwrites duplicates silently. The project root is
 * `process.cwd()`, which both hosts (CLI and dev server) set to the project folder.
 */
import { makeJayAction } from '@jay-framework/fullstack-component';
import { runShareFlow, type ShareFlowInput, type ShareFlowName } from './flows';

function shareAction<Name extends ShareFlowName>(actionName: string, flow: Name) {
    return makeJayAction(actionName).withHandler((input: ShareFlowInput<Name>) =>
        runShareFlow(flow, process.cwd(), input),
    );
}

export const sharePublish = shareAction('sharePublish', 'publish');
export const shareLink = shareAction('shareLink', 'link');
export const sharePull = shareAction('sharePull', 'pull');
export const sharePush = shareAction('sharePush', 'push');
export const shareStatus = shareAction('shareStatus', 'status');
export const shareRestore = shareAction('shareRestore', 'restore');
export const shareUnlink = shareAction('shareUnlink', 'unlink');
