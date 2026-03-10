export type TableArray = Array<Array<string>>;
/**
 * @public
 * PageTableResult
 */
export interface PageTableResult {
    num: number;
    tables: TableArray[];
}
/**
 * @public
 * TableResult
 */
export declare class TableResult {
    pages: Array<PageTableResult>;
    mergedTables: TableArray[];
    total: number;
    constructor(total: number);
}
//# sourceMappingURL=TableResult.d.ts.map