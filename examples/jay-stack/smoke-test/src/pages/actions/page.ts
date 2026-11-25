import {
    makeJayStackComponent,
    PageProps,
    Signals,
    phaseOutput,
} from '@jay-framework/fullstack-component';
import { PageElementRefs, PageContract, PageFastViewState } from './page.jay-html';
import { Props, createSignal } from '@jay-framework/component';
import { getCount, increment } from '../../actions/counter.actions';

async function renderFastChanging(_props: PageProps) {
    return phaseOutput<PageFastViewState, {}>({ count: 0 }, {});
}

function actionsPageConstructor(
    _props: Props<PageProps>,
    refs: PageElementRefs,
    _fastViewState: Signals<PageFastViewState>,
    _carryForward: {},
) {
    const [count, setCount] = createSignal(0);

    refs.getCount.onclick(async () => {
        const result = await getCount({});
        setCount(result.count);
    });

    refs.increment.onclick(async () => {
        const result = await increment({});
        setCount(result.count);
    });

    return {
        render: () => ({ count }),
    };
}

export const page = makeJayStackComponent<PageContract>()
    .withProps<PageProps>()
    .withFastRender(renderFastChanging)
    .withInteractive(actionsPageConstructor);
