/**
 * File upload action demo (DL#131).
 * Demonstrates makeJayAction with .withFiles() for multipart uploads.
 */

import { makeJayAction, makeJayStream, type JayFile } from '@jay-framework/fullstack-component';

/**
 * Upload a product image. Receives the file + metadata, returns file info.
 */
export const uploadProductImage = makeJayAction('upload.productImage')
    .withFiles({ maxFileSize: 5 * 1024 * 1024 }) // 5MB limit
    .withHandler(async (input: { productName: string; image: JayFile }) => {
        const { productName, image } = input;
        console.log(`Uploaded file: ${productName} - ${image.name}`);

        return {
            productName,
            fileName: image.name,
            mimeType: image.type,
            fileSize: image.size,
            message: `Received "${image.name}" (${image.size} bytes) for product "${productName}"`,
        };
    });

/**
 * Upload with streaming response. Receives files, streams back processing steps.
 */
export const processImages = makeJayStream('upload.processImages')
    .withFiles()
    .withHandler(async function* (input: { label: string; images: JayFile[] }) {
        yield { step: 'received', fileCount: input.images.length };

        for (const image of input.images) {
            console.log(`Uploaded files: ${image.name}`);
            yield {
                step: 'processing',
                fileName: image.name,
                size: image.size,
            };
        }

        yield { step: 'done', label: input.label };
    });
