export class Shape {
    static tolerance = 2;
    static applyTransform(p, m) {
        const xt = p[0] * m[0] + p[1] * m[2] + m[4];
        const yt = p[0] * m[1] + p[1] * m[3] + m[5];
        return [xt, yt];
    }
}
//# sourceMappingURL=Shape.js.map