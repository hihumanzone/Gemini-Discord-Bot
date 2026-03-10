/**
 * @public
 * Screenshot
 */
export interface Screenshot {
    data: Uint8Array;
    dataUrl: string;
    pageNumber: number;
    width: number;
    height: number;
    scale: number;
}
/**
 * @public
 * ScreenshotResult
 */
export declare class ScreenshotResult {
    pages: Array<Screenshot>;
    total: number;
    constructor(total: number);
}
//# sourceMappingURL=ScreenshotResult.d.ts.map