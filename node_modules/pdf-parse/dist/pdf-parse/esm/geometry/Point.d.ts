import { Shape } from './Shape.js';
export declare class Point extends Shape {
    x: number;
    y: number;
    constructor(x: number, y: number);
    equal(point: Point): boolean;
    transform(matrix: Array<number>): this;
}
//# sourceMappingURL=Point.d.ts.map