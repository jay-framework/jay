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

    // Signals driven by input events
    const [productName, setProductName] = createSignal('');
    const [selectedFile, setSelectedFile] = createSignal<File | undefined>(undefined);
    const [selectedFiles, setSelectedFiles] = createSignal<File[]>([]);
    const [streamLabel, setStreamLabel] = createSignal('');

    refs.productName.oninput(({event}) => {
        setProductName((event.target as HTMLInputElement).value);
    });

    refs.fileInput.oninput(({event}) => {
        setSelectedFile((event.target as HTMLInputElement).files?.[0]);
    });

    refs.streamLabel.oninput(({event}) => {
        setStreamLabel((event.target as HTMLInputElement).value);
    });

    refs.multiFileInput.oninput(({event}) => {
        setSelectedFiles(Array.from((event.target as HTMLInputElement).files || []));
    });

    // Single file upload
    refs.uploadBtn.onclick(async () => {
        const file = selectedFile();
        if (!file) {
            setUploadResult('Please select a file first.');
            return;
        }

        setUploadResult('Uploading...');
        try {
            const result = await uploadProductImage({
                productName: productName() || 'Unnamed',
                image: file,
            });
            setUploadResult(result.message);
        } catch (err: any) {
            setUploadResult(`Error: ${err.message}`);
        }
    });

    // Streaming multi-file upload
    refs.streamBtn.onclick(async () => {
        const files = selectedFiles();
        if (files.length === 0) {
            setStreamLog('Please select files first.');
            return;
        }

        setStreamLog('Starting...\n');
        try {
            for await (const chunk of processImages({
                label: streamLabel() || 'Untitled',
                images: files,
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
