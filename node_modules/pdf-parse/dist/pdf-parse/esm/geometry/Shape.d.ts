export declare abstract class Shape {
    static tolerance: number;
    abstract transform(matrix: Array<number>): this;
    static applyTransform(p: Array<number>, m: Array<number>): Array<number>;
}
//# sourceMappingURL=Shape.d.ts.map