import {
    makeJayStackComponent,
    PageProps,
    phaseOutput,
    Signals,
} from '@jay-framework/fullstack-component';
import { createEffect, createMemo, createSignal, Props } from '@jay-framework/component';
import type { AddMenuItem } from '@jay-framework/plugin-validator';

import {
    extractAddMenuItemEditorFields,
    getAddMenuItemPreviewHtml,
    patchAddMenuItem,
    serializeAddMenuCatalogForCompare,
} from '../../patch-add-menu-item.js';
import {
    loadDesignSystemAddMenuCatalog,
    regenerateDesignSystemAddMenu,
    runDesignSystemAnalysisAction,
    saveDesignSystemAddMenuCatalog,
} from '../../settings-actions.js';
import { buildDesignAnalysisAgentPrompt } from '../../build-analysis-prompt.js';
import type { DesignAnalysisResult } from '../../run-design-analysis.js';

type StatusTone = 'info' | 'success' | 'warning' | 'error';

type AddMenuListRow = {
    rowKey: string;
    itemId: string;
    title: string;
    subCategory: string;
    rowClass: string;
};

type PageFastViewState = {
    statusMessage: string;
    statusTone: StatusTone;
    showStatusMessage: boolean;
    catalogLoading: boolean;
    showNoCatalog: boolean;
    addMenuListRows: AddMenuListRow[];
    showAddMenuEditor: boolean;
    editorTitle: string;
    editorSubCategory: string;
    editorTokenValue: string;
    editorFontSize: string;
    editorFontWeight: string;
    editorFontFamily: string;
    showTypographyFields: boolean;
    showTokenValueField: boolean;
    editorReadOnly: boolean;
    editorReadOnlyReason: string;
    unsavedChangeCount: number;
    saveButtonLabel: string;
    saveDisabled: boolean;
    discardDisabled: boolean;
    showAnalysisSection: boolean;
    showReport: boolean;
    reportSummary: string;
    reportBody: string;
};

type RefEventHandler = (payload: { event: Event }) => void;

type PageElementRefs = {
    catalogList: { onclick: (handler: RefEventHandler) => void };
    editorTitleInput: { oninput: (handler: RefEventHandler) => void };
    editorTokenValueInput: { oninput: (handler: RefEventHandler) => void };
    editorFontSizeInput: { oninput: (handler: RefEventHandler) => void };
    editorFontWeightInput: { oninput: (handler: RefEventHandler) => void };
    editorFontFamilyInput: { oninput: (handler: RefEventHandler) => void };
    previewHost: { exec$: (fn: (el: HTMLElement) => void) => void };
    saveCatalogBtn: { onclick: (handler: () => void) => void };
    discardCatalogBtn: { onclick: (handler: () => void) => void };
    regenerateCatalogBtn: { onclick: (handler: () => void) => void };
    runAnalysisBtn: { onclick: (handler: () => void) => void };
    sendToAgentBtn: { onclick: (handler: () => void) => void };
    toggleAnalysisBtn: { onclick: (handler: () => void) => void };
};

function notifyAddMenuChanged(): void {
    window.parent.postMessage({ type: 'aiditor:addMenuCatalogChanged' }, window.location.origin);
}

function formatReportBody(result: DesignAnalysisResult): string {
    if (result.findings.length === 0) {
        return 'No design-system findings.';
    }

    const lines: string[] = [];
    let currentFile = '';
    for (const finding of result.findings) {
        if (finding.file !== currentFile) {
            currentFile = finding.file;
            lines.push(`\n${currentFile}`);
        }
        const prefix = finding.severity === 'error' ? 'ERROR' : 'WARN';
        lines.push(`  [${prefix}] (${finding.validator}) ${finding.message}`);
        if (finding.suggestion) {
            lines.push(`    → ${finding.suggestion}`);
        }
    }
    return lines.join('\n').trim();
}

function listRowClass(itemId: string, selectedId: string | null): string {
    return itemId === selectedId ? 'catalog-item catalog-item--selected' : 'catalog-item';
}

async function renderFast() {
    return phaseOutput<PageFastViewState, {}>(
        {
            statusMessage: '',
            statusTone: 'info',
            showStatusMessage: false,
            catalogLoading: true,
            showNoCatalog: false,
            addMenuListRows: [],
            showAddMenuEditor: false,
            editorTitle: '',
            editorSubCategory: '',
            editorTokenValue: '',
            editorFontSize: '',
            editorFontWeight: '',
            editorFontFamily: '',
            showTypographyFields: false,
            showTokenValueField: false,
            editorReadOnly: false,
            editorReadOnlyReason: '',
            unsavedChangeCount: 0,
            saveButtonLabel: 'Save and sync',
            saveDisabled: true,
            discardDisabled: true,
            showAnalysisSection: false,
            showReport: false,
            reportSummary: '',
            reportBody: '',
        },
        {},
    );
}

function settingsPageConstructor(
    _props: Props<PageProps>,
    refs: PageElementRefs,
    _fastViewState: Signals<PageFastViewState>,
) {
    const [statusMessage, setStatusMessage] = createSignal('');
    const [statusTone, setStatusTone] = createSignal<StatusTone>('info');
    const [showStatusMessage, setShowStatusMessage] = createSignal(false);
    const [catalogLoading, setCatalogLoading] = createSignal(true);
    const [showNoCatalog, setShowNoCatalog] = createSignal(false);
    const [draftItems, setDraftItems] = createSignal<AddMenuItem[]>([]);
    const [savedSnapshot, setSavedSnapshot] = createSignal('');
    const [selectedId, setSelectedId] = createSignal<string | null>(null);
    const [editorTitle, setEditorTitle] = createSignal('');
    const [editorSubCategory, setEditorSubCategory] = createSignal('');
    const [editorTokenValue, setEditorTokenValue] = createSignal('');
    const [editorFontSize, setEditorFontSize] = createSignal('');
    const [editorFontWeight, setEditorFontWeight] = createSignal('');
    const [editorFontFamily, setEditorFontFamily] = createSignal('');
    const [showTypographyFields, setShowTypographyFields] = createSignal(false);
    const [showTokenValueField, setShowTokenValueField] = createSignal(false);
    const [editorReadOnly, setEditorReadOnly] = createSignal(false);
    const [editorReadOnlyReason, setEditorReadOnlyReason] = createSignal('');
    const [showAnalysisSection, setShowAnalysisSection] = createSignal(false);
    const [showReport, setShowReport] = createSignal(false);
    const [reportSummary, setReportSummary] = createSignal('');
    const [reportBody, setReportBody] = createSignal('');

    let lastAnalysis: DesignAnalysisResult | null = null;
    let syncingEditorFromSelection = false;

    const unsavedChangeCount = createMemo(() => {
        const draft = draftItems();
        const saved = savedSnapshot();
        if (!saved) return 0;
        return serializeAddMenuCatalogForCompare(draft) === saved ? 0 : 1;
    });

    const addMenuListRows = createMemo((): AddMenuListRow[] => {
        const selected = selectedId();
        return draftItems().map((item) => ({
            rowKey: item.id,
            itemId: item.id,
            title: item.title,
            subCategory: item.subCategory ?? 'Other',
            rowClass: listRowClass(item.id, selected),
        }));
    });

    const showAddMenuEditor = createMemo(() => selectedId() !== null);
    const saveDisabled = createMemo(
        () => catalogLoading() || unsavedChangeCount() === 0 || draftItems().length === 0,
    );
    const discardDisabled = createMemo(
        () => catalogLoading() || unsavedChangeCount() === 0 || draftItems().length === 0,
    );
    const saveButtonLabel = createMemo(() => 'Save and sync');

    function updatePreview() {
        const item = draftItems().find((entry) => entry.id === selectedId());
        if (!item) return;
        const html = getAddMenuItemPreviewHtml(item);
        refs.previewHost.exec$((element) => {
            element.innerHTML = html;
        });
    }

    function loadEditorFieldsFromItem(item: AddMenuItem) {
        syncingEditorFromSelection = true;
        const fields = extractAddMenuItemEditorFields(item);
        setEditorTitle(fields.title);
        setEditorSubCategory(item.subCategory ?? '');
        setEditorTokenValue(fields.tokenValue);
        setEditorFontSize(fields.fontSize);
        setEditorFontWeight(fields.fontWeight);
        setEditorFontFamily(fields.fontFamily);
        setShowTypographyFields(fields.kind === 'typography');
        setShowTokenValueField(
            fields.kind === 'color' || fields.kind === 'spacing' || fields.kind === 'rounded',
        );
        setEditorReadOnly(!fields.editable);
        setEditorReadOnlyReason(fields.readOnlyReason);
        syncingEditorFromSelection = false;
        updatePreview();
    }

    function applyEditorPatchToDraft() {
        if (syncingEditorFromSelection || editorReadOnly()) return;
        const currentId = selectedId();
        if (!currentId) return;

        setDraftItems((items) =>
            items.map((item) => {
                if (item.id !== currentId) return item;
                return patchAddMenuItem(item, {
                    title: editorTitle(),
                    tokenValue: editorTokenValue(),
                    fontSize: editorFontSize(),
                    fontWeight: editorFontWeight(),
                    fontFamily: editorFontFamily(),
                });
            }),
        );
        updatePreview();
    }

    function selectItem(itemId: string) {
        setSelectedId(itemId);
        const item = draftItems().find((entry) => entry.id === itemId);
        if (item) {
            loadEditorFieldsFromItem(item);
        }
    }

    async function loadCatalog() {
        setCatalogLoading(true);
        try {
            const result = await loadDesignSystemAddMenuCatalog({});
            const items = result.items;
            setDraftItems(items);
            const snapshot = serializeAddMenuCatalogForCompare(items);
            setSavedSnapshot(snapshot);
            setShowNoCatalog(items.length === 0);
            if (items.length > 0) {
                selectItem(items[0]!.id);
            } else {
                setSelectedId(null);
            }
        } catch (error) {
            setShowNoCatalog(true);
            setStatusMessage(
                error instanceof Error ? error.message : 'Failed to load add-menu catalog.',
            );
            setStatusTone('error');
            setShowStatusMessage(true);
        } finally {
            setCatalogLoading(false);
        }
    }

    createEffect(() => {
        void loadCatalog();
    });

    refs.catalogList.onclick(({ event }) => {
        const target = (event.target as HTMLElement | null)?.closest('[data-catalog-item]');
        if (!target) return;
        const itemId = target.getAttribute('data-catalog-item');
        if (itemId) {
            selectItem(itemId);
        }
    });

    refs.editorTitleInput.oninput(({ event }) => {
        setEditorTitle((event.target as HTMLInputElement).value);
        applyEditorPatchToDraft();
    });
    refs.editorTokenValueInput.oninput(({ event }) => {
        setEditorTokenValue((event.target as HTMLInputElement).value);
        applyEditorPatchToDraft();
    });
    refs.editorFontSizeInput.oninput(({ event }) => {
        setEditorFontSize((event.target as HTMLInputElement).value);
        applyEditorPatchToDraft();
    });
    refs.editorFontWeightInput.oninput(({ event }) => {
        setEditorFontWeight((event.target as HTMLInputElement).value);
        applyEditorPatchToDraft();
    });
    refs.editorFontFamilyInput.oninput(({ event }) => {
        setEditorFontFamily((event.target as HTMLInputElement).value);
        applyEditorPatchToDraft();
    });

    refs.saveCatalogBtn.onclick(async () => {
        setStatusMessage('Saving add-menu catalog…');
        setStatusTone('info');
        setShowStatusMessage(true);
        try {
            const result = await saveDesignSystemAddMenuCatalog({ items: draftItems() });
            setSavedSnapshot(serializeAddMenuCatalogForCompare(draftItems()));
            setStatusMessage(result.message);
            setStatusTone('success');
            notifyAddMenuChanged();
        } catch (error) {
            setStatusMessage(error instanceof Error ? error.message : 'Save failed.');
            setStatusTone('error');
        }
    });

    refs.discardCatalogBtn.onclick(() => {
        const saved = savedSnapshot();
        if (!saved) return;
        const items = JSON.parse(saved) as AddMenuItem[];
        setDraftItems(items);
        const currentId = selectedId();
        const nextItem = items.find((item) => item.id === currentId) ?? items[0];
        if (nextItem) {
            selectItem(nextItem.id);
        }
        setStatusMessage('Discarded unsaved changes.');
        setStatusTone('info');
        setShowStatusMessage(true);
    });

    refs.regenerateCatalogBtn.onclick(async () => {
        if (unsavedChangeCount() > 0) {
            setStatusMessage('Save or discard your changes before regenerating from DESIGN.md.');
            setStatusTone('warning');
            setShowStatusMessage(true);
            return;
        }
        setStatusMessage('Regenerating add-menu catalog from DESIGN.md…');
        setStatusTone('info');
        setShowStatusMessage(true);
        try {
            const result = await regenerateDesignSystemAddMenu({});
            await loadCatalog();
            setStatusMessage(result.message);
            setStatusTone('success');
            notifyAddMenuChanged();
        } catch (error) {
            setStatusMessage(error instanceof Error ? error.message : 'Regenerate failed.');
            setStatusTone('error');
        }
    });

    refs.toggleAnalysisBtn.onclick(() => {
        setShowAnalysisSection((value) => !value);
    });

    refs.runAnalysisBtn.onclick(async () => {
        setStatusMessage('Running design-system analysis…');
        setStatusTone('info');
        setShowStatusMessage(true);
        try {
            const result = await runDesignSystemAnalysisAction({});
            lastAnalysis = result;
            setShowReport(true);
            setReportSummary(
                `Scanned ${result.filesScanned} file(s) — ${result.errorCount} error(s), ${result.warningCount} warning(s).`,
            );
            setReportBody(formatReportBody(result));
            setStatusMessage('Analysis complete.');
            setStatusTone(
                result.errorCount > 0 ? 'error' : result.warningCount > 0 ? 'warning' : 'success',
            );
        } catch (error) {
            setShowReport(false);
            setStatusMessage(error instanceof Error ? error.message : 'Analysis failed.');
            setStatusTone('error');
        }
    });

    refs.sendToAgentBtn.onclick(() => {
        if (!lastAnalysis || lastAnalysis.findings.length === 0) {
            setStatusMessage('Run analysis first and ensure there are findings to send.');
            setStatusTone('warning');
            setShowStatusMessage(true);
            return;
        }
        window.parent.postMessage(
            {
                type: 'aiditor:submitAgentTask',
                prompt: buildDesignAnalysisAgentPrompt(lastAnalysis),
                context: {
                    pageRoute: '/',
                    renderedUrl: window.location.origin,
                },
            },
            window.location.origin,
        );
    });

    return {
        render: () => ({
            statusMessage: statusMessage(),
            statusTone: statusTone(),
            showStatusMessage: showStatusMessage(),
            catalogLoading: catalogLoading(),
            showNoCatalog: showNoCatalog(),
            addMenuListRows: addMenuListRows(),
            showAddMenuEditor: showAddMenuEditor(),
            editorTitle: editorTitle(),
            editorSubCategory: editorSubCategory(),
            editorTokenValue: editorTokenValue(),
            editorFontSize: editorFontSize(),
            editorFontWeight: editorFontWeight(),
            editorFontFamily: editorFontFamily(),
            showTypographyFields: showTypographyFields(),
            showTokenValueField: showTokenValueField(),
            editorReadOnly: editorReadOnly(),
            editorReadOnlyReason: editorReadOnlyReason(),
            unsavedChangeCount: unsavedChangeCount(),
            saveButtonLabel: saveButtonLabel(),
            saveDisabled: saveDisabled(),
            discardDisabled: discardDisabled(),
            showAnalysisSection: showAnalysisSection(),
            showReport: showReport(),
            reportSummary: reportSummary(),
            reportBody: reportBody(),
        }),
    };
}

export const designSystemSettingsPage = makeJayStackComponent()
    .withProps<PageProps>()
    .withFastRender(renderFast)
    .withInteractive(settingsPageConstructor);
