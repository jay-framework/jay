import { createShareContext, type ShareContext } from './core/context';
import { toReport } from './core/report';
import type { ShareReport } from './core/types';
import { publish, type PublishInput } from './core/publish';
import { link, type LinkInput } from './core/link';
import { pull, type PullInput } from './core/pull';
import { push, type PushInput } from './core/push';
import { status, type StatusInput } from './core/status';
import { restore } from './core/restore';
import { unlink, type UnlinkInput } from './core/unlink';

/** The 7 flows keyed by CLI command name; each action and command calls exactly one of them. */
export const shareFlows = {
    publish: (ctx: ShareContext, input: PublishInput) => publish(ctx, input),
    link: (ctx: ShareContext, input: LinkInput) => link(ctx, input),
    pull: (ctx: ShareContext, input: PullInput) => pull(ctx, input),
    push: (ctx: ShareContext, input: PushInput) => push(ctx, input),
    status: (ctx: ShareContext, input: StatusInput) => status(ctx, input),
    restore: (ctx: ShareContext, _input: Record<string, never>) => restore(ctx),
    unlink: (ctx: ShareContext, input: UnlinkInput) => unlink(ctx, input),
};

export type ShareFlowName = keyof typeof shareFlows;
export type ShareFlowInput<Name extends ShareFlowName> = Parameters<(typeof shareFlows)[Name]>[1];

/** Runs a flow and always returns a ShareReport — a share failure is data, not an exception. */
export async function runShareFlow<Name extends ShareFlowName>(
    name: Name,
    projectRoot: string,
    input: ShareFlowInput<Name>,
): Promise<ShareReport> {
    try {
        const flow = shareFlows[name] as (
            ctx: ShareContext,
            input: ShareFlowInput<Name>,
        ) => Promise<ShareReport>;
        return await flow(createShareContext(projectRoot), input ?? ({} as ShareFlowInput<Name>));
    } catch (error) {
        return toReport(error);
    }
}
