/**
 * @public
 * HyperlinkPosition
 */
export type HyperlinkPosition = {
    rect: {
        left: number;
        top: number;
        right: number;
        bottom: number;
    };
    url: string;
    text: string;
    used: boolean;
};
/**
 * @public
 * PageTextResult
 */
export interface PageTextResult {
    num: number;
    text: string;
}
/**
 * @public
 * TextResult
 */
export declare class TextResult {
    pages: Array<PageTextResult>;
    text: string;
    total: number;
    getPageText(num: number): string;
    constructor(total: number);
}
//# sourceMappingURL=TextResult.d.ts.map