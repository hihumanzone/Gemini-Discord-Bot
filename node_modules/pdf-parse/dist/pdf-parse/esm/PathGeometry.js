export var PathGeometry;
(function (PathGeometry) {
    PathGeometry[PathGeometry["undefined"] = 0] = "undefined";
    PathGeometry[PathGeometry["hline"] = 1] = "hline";
    PathGeometry[PathGeometry["vline"] = 2] = "vline";
    PathGeometry[PathGeometry["rectangle"] = 3] = "rectangle";
})(PathGeometry || (PathGeometry = {}));
export var DrawOPS;
(function (DrawOPS) {
    DrawOPS[DrawOPS["moveTo"] = 0] = "moveTo";
    DrawOPS[DrawOPS["lineTo"] = 1] = "lineTo";
    DrawOPS[DrawOPS["curveTo"] = 2] = "curveTo";
    DrawOPS[DrawOPS["closePath"] = 3] = "closePath";
    DrawOPS[DrawOPS["rectangle"] = 4] = "rectangle";
})(DrawOPS || (DrawOPS = {}));
//# sourceMappingURL=PathGeometry.js.map