import {
    getJayTsFileSourcePath,
    getModeFromExtension,
    hasExtension,
    hasJayModeExtension,
    RuntimeMode,
    withoutExtension,
} from '../lib';

describe('hasExtension', () => {
    it('returns true when the filename ends with the extension', () => {
        expect(hasExtension('app.jay-html', '.jay-html')).toBe(true);
        expect(hasExtension('app.jay-html.ts', '.jay-html')).toBe(false);
        expect(hasExtension('app.jay.html', '.jay-html')).toBe(false);
    });

    describe('withTs: true', () => {
        const withTs = true;

        it('returns true when the filename ends with the extension and .ts', () => {
            expect(hasExtension('app.jay-html', '.jay-html', { withTs })).toBe(false);
            expect(hasExtension('app.jay-html.ts', '.jay-html', { withTs })).toBe(true);
            expect(hasExtension('app.jay.html', '.jay-html', { withTs })).toBe(false);
        });
    });
});

describe('hasJayModeExtension', () => {
    it('returns true when the filename ends with jay sandbox main or worker extension', () => {
        expect(hasJayModeExtension('app.jay-html')).toBe(false);
        expect(hasJayModeExtension('app.jay-html?jay-mainSandbox')).toBe(true);
        expect(hasJayModeExtension('app.jay-html?jay-workerTrusted')).toBe(true);
        expect(hasJayModeExtension('app.jay-html?jay-workerSandbox')).toBe(true);
        expect(hasJayModeExtension('app.jay-html?jay-mainSandbox.ts')).toBe(false);
    });

    describe('withTs: true', () => {
        const withTs = true;

        it('returns true when the filename ends with the jay sandbox main or worker extension and .ts', () => {
            expect(hasJayModeExtension('app.jay-html?jay-mainSandbox', { withTs })).toBe(false);
            expect(hasJayModeExtension('app.jay-html?jay-mainSandbox.ts', { withTs })).toBe(true);
            expect(hasJayModeExtension('app.jay-html?jay-workerTrusted.ts', { withTs })).toBe(true);
            expect(hasJayModeExtension('app.jay-html?jay-workerSandbox.ts', { withTs })).toBe(true);
            expect(hasJayModeExtension('app.jay-html?jay-mainSandbox.js', { withTs })).toBe(false);
            expect(hasJayModeExtension('app.jay-html', { withTs })).toBe(false);
        });
    });
});

describe('getModeFromExtension', () => {
    it('returns trusted', () => {
        expect(getModeFromExtension('counter')).toBe(RuntimeMode.MainTrusted);
        expect(getModeFromExtension('counter.ts')).toBe(RuntimeMode.MainTrusted);
        expect(getModeFromExtension('app.jay-html')).toBe(RuntimeMode.MainTrusted);
        expect(getModeFromExtension('app.jay-html.ts')).toBe(RuntimeMode.MainTrusted);
    });

    describe('for sandbox main ending', () => {
        const postfix = '?jay-mainSandbox';

        it('returns mainSandbox when file ends with *.jay-html?jay-mainSandbox or *.ts?jay-mainSandbox"', () => {
            expect(getModeFromExtension(`counter${postfix}`)).toBe(RuntimeMode.MainTrusted);
            expect(getModeFromExtension(`counter.ts${postfix}.ts`)).toBe(RuntimeMode.MainSandbox);
            expect(getModeFromExtension(`app.jay-html${postfix}`)).toBe(RuntimeMode.MainTrusted);
            expect(getModeFromExtension(`app.jay-html${postfix}.ts`)).toBe(RuntimeMode.MainSandbox);
            expect(getModeFromExtension(`app.jay-html.ts${postfix}`)).toBe(RuntimeMode.MainTrusted);
        });
    });

    describe('for worker trusted', () => {
        const postfix = '?jay-workerTrusted';

        it('returns workerTrusted', () => {
            expect(getModeFromExtension(`counter.ts${postfix}.ts`)).toBe(RuntimeMode.WorkerTrusted);
        });
    });

    describe('for worker sandbox', () => {
        const postfix = '?jay-workerSandbox';

        it('returns workerSandbox', () => {
            expect(getModeFromExtension(`counter.ts${postfix}.ts`)).toBe(RuntimeMode.WorkerSandbox);
        });
    });
});

describe('getJayTsFileSourcePath', () => {
    it('extracts [name] from [name]?jay-[mode].ts', () => {
        expect(() => getJayTsFileSourcePath('app.jay-html')).toThrow(
            'does not contain jay mode extension',
        );
        expect(() => getJayTsFileSourcePath('app.jay-html.ts')).toThrow(
            'does not contain jay mode extension',
        );
        expect(getJayTsFileSourcePath('app.jay-html?jay-mainSandbox')).toBe('app.jay-html.ts');
        expect(getJayTsFileSourcePath('app.jay-html?jay-mainSandbox.ts')).toBe('app.jay-html.ts');
        expect(getJayTsFileSourcePath('app.jay-html?jay-workerTrusted.ts')).toBe('app.jay-html.ts');
        expect(getJayTsFileSourcePath('app.jay-html?jay-workerSandbox.ts')).toBe('app.jay-html.ts');
    });
});

describe('withoutExtension', () => {
    it('removes last extension.length characters', () => {
        expect(withoutExtension('app.jay-html', '.jay-html')).toBe('app');
        expect(() => withoutExtension('app.jay-html', '.ts')).toThrow(
            'does not end with extension',
        );
    });
});
