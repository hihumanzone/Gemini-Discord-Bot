import type { ImageKind } from 'pdfjs-dist/legacy/build/pdf.mjs';
/**
 * @public
 * ImageKindKey
 * - Represents the keys of the ImageKind enum (e.g. "GRAYSCALE_1BPP", "RGB_24BPP", "RGBA_32BPP").
 */
export type ImageKindKey = keyof typeof ImageKind;
/**
 * @public
 * ImageKindValue
 * - Represents the numeric values of the ImageKind enum (e.g. 1, 2, 3).
 */
export type ImageKindValue = (typeof ImageKind)[ImageKindKey];
/**
 * @public
 * ImageResult
 * Helper container for extracted images grouped per page.
 */
export declare class ImageResult {
    pages: Array<PageImages>;
    total: number;
    getPageImage(num: number, name: string): EmbeddedImage | null;
    constructor(total: number);
}
/**
 * @public
 * PageImages
 * - Represents all embedded images found on a single PDF page.
 * - pageNumber: 1-based page index.
 * - images: Array of EmbeddedImage objects for this page.
 */
export interface PageImages {
    pageNumber: number;
    images: EmbeddedImage[];
}
/**
 * @public
 * EmbeddedImage
 * - Normalized representation of an embedded image extracted from the PDF.
 * - `data`: Raw image bytes (e.g. PNG/JPEG) as Uint8Array. Use this for file writing or binary processing.
 * - `dataUrl`: Optional data URL (e.g. "data:image/png;base64,...") for directly embedding in <img> src.
 *   Storing both lets consumers choose the most convenient form; consider omitting one to save memory.
 * - `name`: Resource name for the image.
 * - `width` / `height`: Dimensions in pixels.
 * - `kind`: ImageKindValue from indicating the pixel format (e.g. GRAYSCALE_1BPP / RGB_24BPP / RGBA_32BPP).
 */
export interface EmbeddedImage {
    data: Uint8Array;
    dataUrl: string;
    name: string;
    width: number;
    height: number;
    kind: ImageKindValue;
}
//# sourceMappingURL=ImageResult.d.ts.map