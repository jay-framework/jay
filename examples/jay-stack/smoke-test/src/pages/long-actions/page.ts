import {
    makeJayStackComponent,
    PageProps,
    Signals,
    phaseOutput,
} from '@jay-framework/fullstack-component';
import { PageElementRefs, PageContract, PageFastViewState } from './page.jay-html';
import { Props, createSignal } from '@jay-framework/component';
import { slowAction, slowQuery, ticker } from '../../actions/long.actions';

async function renderFastChanging(_props: PageProps) {
    return phaseOutput<PageFastViewState, {}>(
        { actionResult: '', queryResult: '', streamLog: '' },
        {},
    );
}

function longActionsPageConstructor(
    _props: Props<PageProps>,
    refs: PageElementRefs,
    _fastViewState: Signals<PageFastViewState>,
    _carryForward: {},
) {
    const [actionResult, setActionResult] = createSignal('');
    const [queryResult, setQueryResult] = createSignal('');
    const [streamLog, setStreamLog] = createSignal('');

    // A long POST action — the transport defers it to a 202 + ticket poll, resolved transparently.
    refs.runAction.onclick(async () => {
        setActionResult('running…');
        try {
            const result = await slowAction({ label: 'hi' });
            setActionResult(`${result.label} @ ${result.at}`);
        } catch (err: any) {
            setActionResult(`error: ${err.message}`);
        }
    });

    // A long GET query — also deferred.
    refs.runQuery.onclick(async () => {
        setQueryResult('running…');
        try {
            const result = await slowQuery({});
            setQueryResult(result.value);
        } catch (err: any) {
            setQueryResult(`error: ${err.message}`);
        }
    });

    // A long stream — delivered as resumable segments, reassembled by the client caller.
    refs.runStream.onclick(async () => {
        setStreamLog('start ');
        try {
            for await (const chunk of ticker({})) {
                setStreamLog((prev) => `${prev}${chunk} `);
            }
            setStreamLog((prev) => `${prev}done`);
        } catch (err: any) {
            setStreamLog((prev) => `${prev}error: ${err.message}`);
        }
    });

    return {
        render: () => ({ actionResult, queryResult, streamLog }),
    };
}

export const page = makeJayStackComponent<PageContract>()
    .withProps<PageProps>()
    .withFastRender(renderFastChanging)
    .withInteractive(longActionsPageConstructor);
