import { DevServerRoute } from '@jay-framework/dev-server';
import fs from 'fs';
import path from 'path';
import {
    generateElementDefinitionFile,
    JAY_IMPORT_RESOLVER,
    parseJayFile,
} from '@jay-framework/compiler-jay-html';

export async function generatePageDefinitionFiles(routes: DevServerRoute[], tsConfigPath: string, projectRoot: string) {
    for (const route of routes) {
        const jayHtmlPath = route.fsRoute.jayHtmlPath;

        // Check if the page.jay-html file exists
        if (!fs.existsSync(jayHtmlPath)) {
            continue;
        }

        const definitionFilePath = jayHtmlPath + '.d.ts';

        // Check if definition file exists and is up to date
        try {
            const [sourceStats, defStats] = await Promise.all([
                fs.promises.stat(jayHtmlPath),
                fs.promises.stat(definitionFilePath).catch(() => null),
            ]);

            // Skip if definition file exists and is newer than source
            if (defStats && defStats.mtime >= sourceStats.mtime) {
                continue;
            }
        } catch (error) {
            // If we can't check stats, continue with generation
        }

        try {
            // Read the jay-html content
            const jayHtml = await fs.promises.readFile(jayHtmlPath, 'utf-8');

            const filename = path.basename(jayHtmlPath);
            const dirname = path.dirname(jayHtmlPath);

            // Parse the jay file
            const parsedJayHtml = await parseJayFile(
                jayHtml,
                filename,
                dirname,
                { relativePath: tsConfigPath },
                JAY_IMPORT_RESOLVER,
                projectRoot,
            );

            // Generate the definition file
            const definitionFile = generateElementDefinitionFile(parsedJayHtml);

            if (definitionFile.validations.length > 0) {
                console.log(
                    `failed to generate .d.ts for ${jayHtmlPath} with validation errors: ${definitionFile.validations.join('\n')}`,
                );
            } else {
                // Save the definition file as page.jay-html.d.ts
                const definitionFilePath = jayHtmlPath + '.d.ts';
                await fs.promises.writeFile(definitionFilePath, definitionFile.val, 'utf-8');
                console.log(`📦 Generated definition file: ${definitionFilePath}`);
            }
        } catch (error) {
            console.error(`Failed to generate definition file for ${jayHtmlPath}:`, error);
        }
    }
}
