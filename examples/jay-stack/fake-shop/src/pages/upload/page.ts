import {
    makeJayStackComponent,
    PageProps,
    Signals,
    phaseOutput,
} from '@jay-framework/fullstack-component';
import { PageElementRefs, PageContract, PageFastViewState } from './page.jay-html';
import { Props } from '@jay-framework/component';
import { createSignal } from '@jay-framework/component';
import { uploadProductImage, processImages } from '../../actions/upload.actions';

async function renderFastChanging(props: PageProps) {
    return phaseOutput<PageFastViewState, {}>({ uploadResult: '', streamLog: '' }, {});
}

function uploadPageConstructor(
    props: Props<PageProps>,
    refs: PageElementRefs,
    fastViewState: Signals<PageFastViewState>,
    _carryForward: {},
) {
    const [uploadResult, setUploadResult] = createSignal('');
    const [streamLog, setStreamLog] = createSignal('');

    // Single file upload
    refs.uploadBtn.onclick(async () => {
        let file: File | undefined;
        let productName = '';

        refs.fileInput.exec$((el) => {
            file = (el as HTMLInputElement).files?.[0];
        });
        refs.productName.exec$((el) => {
            productName = (el as HTMLInputElement).value;
        });

        if (!file) {
            setUploadResult('Please select a file first.');
            return;
        }

        setUploadResult('Uploading...');
        try {
            const result = await uploadProductImage({
                productName: productName || 'Unnamed',
                image: file as any,
            });
            setUploadResult(result.message);
        } catch (err: any) {
            setUploadResult(`Error: ${err.message}`);
        }
    });

    // Streaming multi-file upload
    refs.streamBtn.onclick(async () => {
        let files: File[] = [];
        let label = '';

        refs.multiFileInput.exec$((el) => {
            files = Array.from((el as HTMLInputElement).files || []);
        });
        refs.streamLabel.exec$((el) => {
            label = (el as HTMLInputElement).value;
        });

        if (files.length === 0) {
            setStreamLog('Please select files first.');
            return;
        }

        setStreamLog('Starting...\n');
        try {
            for await (const chunk of processImages({
                label: label || 'Untitled',
                images: files as any[],
            })) {
                setStreamLog((prev) => prev + JSON.stringify(chunk) + '\n');
            }
        } catch (err: any) {
            setStreamLog((prev) => prev + `Error: ${err.message}\n`);
        }
    });

    return {
        render: () => ({
            uploadResult: uploadResult(),
            streamLog: streamLog(),
        }),
    };
}

export const page = makeJayStackComponent<PageContract>()
    .withProps<PageProps>()
    .withFastRender(renderFastChanging)
    .withInteractive(uploadPageConstructor);
