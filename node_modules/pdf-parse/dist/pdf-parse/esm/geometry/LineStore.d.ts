import { Line } from './Line.js';
import type { Rectangle } from './Rectangle.js';
import { Table } from './Table.js';
import type { TableData } from './TableData.js';
export declare class LineStore {
    hLines: Array<Line>;
    vLines: Array<Line>;
    add(line: Line): void;
    addRectangle(rect: Rectangle): void;
    getTableData(): Array<TableData>;
    getTables(): Array<Table>;
    normalize(): void;
    normalizeHorizontal(): void;
    normalizeVertical(): void;
    private fillTable;
    private tryFill;
    private margeHorizontalLines;
    private margeVerticalLines;
}
//# sourceMappingURL=LineStore.d.ts.map