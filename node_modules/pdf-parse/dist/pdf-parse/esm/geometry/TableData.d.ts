import type { Point } from './Point.js';
export type TableCell = {
    minXY: Point;
    maxXY: Point;
    width: number;
    height: number;
    colspan?: number;
    rowspan?: number;
    text: Array<string>;
};
export type TableRow = Array<TableCell>;
export declare class TableData {
    minXY: Point;
    maxXY: Point;
    rows: Array<TableRow>;
    private rowPivots;
    private colPivots;
    constructor(minXY: Point, maxXY: Point, rowPivots: Array<number>, colPivots: Array<number>);
    findCell(x: number, y: number): TableCell | undefined;
    get cellCount(): number;
    get rowCount(): number;
    check(): boolean;
    toArray(): string[][];
}
//# sourceMappingURL=TableData.d.ts.map