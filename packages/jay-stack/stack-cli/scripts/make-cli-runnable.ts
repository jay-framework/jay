import shell from 'shelljs';
import path from 'node:path';

export function makeCliRunnable() {
    shell.chmod('u+x', path.resolve(__dirname, '../dist/index.js'));
    console.log('Added permission to run jay-cli');
}
