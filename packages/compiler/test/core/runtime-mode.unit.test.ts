import {
    getJayTsFileSourcePath,
    getModeFromExtension,
    hasExtension,
    hasJayModeExtension,
    RuntimeMode,
    withoutExtension,
} from '../../lib';

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
        expect(hasJayModeExtension('app.jay-html?jay-sandboxMain')).toBe(true);
        expect(hasJayModeExtension('app.jay-html?jay-sandboxWorker')).toBe(true);
        expect(hasJayModeExtension('app.jay-html?jay-sandboxMain.ts')).toBe(false);
    });

    describe('withTs: true', () => {
        const withTs = true;

        it('returns true when the filename ends with the jay sandbox main or worker extension and .ts', () => {
            expect(hasJayModeExtension('app.jay-html?jay-sandboxMain', { withTs })).toBe(false);
            expect(hasJayModeExtension('app.jay-html?jay-sandboxMain.ts', { withTs })).toBe(true);
            expect(hasJayModeExtension('app.jay-html?jay-sandboxWorker.ts', { withTs })).toBe(true);
            expect(hasJayModeExtension('app.jay-html?jay-sandboxMain.js', { withTs })).toBe(false);
            expect(hasJayModeExtension('app.jay-html', { withTs })).toBe(false);
        });
    });
});

describe('getModeFromExtension', () => {
    it('returns trusted', () => {
        expect(getModeFromExtension('counter')).toBe(RuntimeMode.Trusted);
        expect(getModeFromExtension('counter.ts')).toBe(RuntimeMode.Trusted);
        expect(getModeFromExtension('app.jay-html')).toBe(RuntimeMode.Trusted);
        expect(getModeFromExtension('app.jay-html.ts')).toBe(RuntimeMode.Trusted);
    });

    describe('for sandbox main ending', () => {
        const postfix = '?jay-sandboxMain';

        it('returns sandboxMain when file ends with *.jay-html?jay-sandboxMain or *.ts?jay-sandboxMain"', () => {
            expect(getModeFromExtension(`counter${postfix}`)).toBe(RuntimeMode.Trusted);
            expect(getModeFromExtension(`counter.ts${postfix}.ts`)).toBe(RuntimeMode.SandboxMain);
            expect(getModeFromExtension(`app.jay-html${postfix}`)).toBe(RuntimeMode.Trusted);
            expect(getModeFromExtension(`app.jay-html${postfix}.ts`)).toBe(RuntimeMode.SandboxMain);
            expect(getModeFromExtension(`app.jay-html.ts${postfix}`)).toBe(RuntimeMode.Trusted);
        });
    });

    describe('for sandbox worker', () => {
        const postfix = '?jay-sandboxWorker';

        it('returns sandboxMain when file ends with *.jay-html?jay-sandboxMain or *.ts?jay-sandboxMain"', () => {
            expect(getModeFromExtension(`counter.ts${postfix}.ts`)).toBe(RuntimeMode.SandboxWorker);
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
        expect(getJayTsFileSourcePath('app.jay-html?jay-sandboxMain')).toBe('app.jay-html.ts');
        expect(getJayTsFileSourcePath('app.jay-html?jay-sandboxMain.ts')).toBe('app.jay-html.ts');
        expect(getJayTsFileSourcePath('app.jay-html?jay-sandboxWorker.ts')).toBe('app.jay-html.ts');
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
