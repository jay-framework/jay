import { makeJayAction, makeJayQuery, makeJayStream } from '@jay-framework/fullstack-component';

/**
 * Long-running actions for the DL#239 end-to-end check. Each runs well past the smoke project's
 * `server.actionPollAfterMs` budget, so the server breaks them into a 202 + poll (value/query) or
 * resumable NDJSON segments (stream). Fast actions (counter.*) stay within the budget and are
 * unaffected.
 */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** POST action that runs ~1.2s — exceeds the budget, so it defers to a ticket poll. */
export const slowAction = makeJayAction('long.slowAction').withHandler(
    async (input: { label?: string }) => {
        await sleep(1200);
        return { label: input.label ?? 'done', at: 'slowAction' };
    },
);

/** GET query that runs ~1.2s — a deferred GET (poll is no-store). */
export const slowQuery = makeJayQuery('long.slowQuery').withHandler(async (_input: {}) => {
    await sleep(1200);
    return { value: 'slow-query-result' };
});

/**
 * Stream that yields numbers with a growing gap before each (95ms, 190ms, 285ms, …). With a budget
 * around a few hundred ms this spans every segment shape: early segments carry several chunks, later
 * ones carry one, and the largest gaps produce resume-only (empty) segments.
 */
export const ticker = makeJayStream('long.ticker').withHandler(async function* (input: {
    n?: number;
}) {
    const n = input.n ?? 10;
    for (let i = 0; i < n; i++) {
        await sleep(95 * (i + 1));
        yield i;
    }
});
