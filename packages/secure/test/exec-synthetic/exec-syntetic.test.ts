import { setChannel, useMockCommunicationChannel } from '../util/mock-channel';
import { initializeWorker } from './secure/worker/worker-root';
import { render } from './secure/main/app.jay.html';
import { eventually10ms } from '../util/eventually';

const VERBOSE = false;
describe('exec synthetic tests', () => {
    async function mkElement() {
        let channel = useMockCommunicationChannel(VERBOSE);
        setChannel(channel);
        initializeWorker();
        let appElement = render({});
        let result = appElement.dom.querySelector('[data-id="result"]') as HTMLDivElement;
        let buttonExec$Global = appElement.dom.querySelector(
            '[data-id="button-exec-global"]',
        ) as HTMLButtonElement;
        let buttonExec$Element = appElement.dom.querySelector(
            '[data-id="button-exec-element"]',
        ) as HTMLButtonElement;

        let getItemButtonExec$ById = (id) =>
            appElement.dom.querySelector(
                `[data-id="item-${id}-button-exec-element"]`,
            ) as HTMLButtonElement;

        await channel.toBeClean();
        return {
            channel,
            appElement,
            result,
            buttonExec$Global,
            buttonExec$Element,
            getDynamicButtonById: getItemButtonExec$ById,
        };
    }

    it('should run $exec on a static element and return value', async () => {
        let { result, buttonExec$Element } = await mkElement();

        buttonExec$Element.click();
        await eventually10ms(() => {
            expect(result.textContent).toBe('button with text button exec element was clicked');
        });
    });

    it('should run global $exec return value', async () => {
        let { result, buttonExec$Global } = await mkElement();

        document.title = 'hello from global exec test';

        buttonExec$Global.click();
        await eventually10ms(() => {
            expect(result.textContent).toBe(
                'global exec was clicked. document.title: hello from global exec test',
            );
        });
    });

    it('should run $exec on a dynamic element and return value', async () => {
        let { result, getDynamicButtonById } = await mkElement();

        getDynamicButtonById('b').click();
        await eventually10ms(() => {
            expect(result.textContent).toBe(
                'item button with text item beta exec element was clicked',
            );
        });
    });
});
