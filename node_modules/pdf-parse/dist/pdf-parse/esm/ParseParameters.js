export function setDefaultParseParameters(params) {
    params.lineThreshold = params?.lineThreshold ?? 4.6;
    params.cellThreshold = params?.cellThreshold ?? 7;
    params.cellSeparator = params?.cellSeparator ?? '\t';
    params.lineEnforce = params?.lineEnforce ?? true;
    params.pageJoiner = params?.pageJoiner ?? '\n-- page_number of total_number --';
    params.imageThreshold = params?.imageThreshold ?? 80;
    params.imageDataUrl = params?.imageDataUrl ?? true;
    params.imageBuffer = params?.imageBuffer ?? true;
    params.scale = params?.scale ?? 1;
    return params;
}
//# sourceMappingURL=ParseParameters.js.map