import { promises as fs } from 'fs';
import path from 'path';

export async function findAllJayFiles(dir): Promise<string[]> {
    let files = await fs.readdir(dir);
    let jayFiles: string[] = [];
    for (let file of files)
        if ((await fs.stat(dir + '/' + file)).isDirectory())
            jayFiles = [...jayFiles, ...(await findAllJayFiles(dir + '/' + file))];
        else if (file.endsWith('.jay.html') && !file.startsWith('.jay.html'))
            jayFiles.push(path.join(dir, '/', file));
    return jayFiles;
}
