'use strict';

/**
 * Rank area-blast centers that cover the most targets (Smart Cast helper).
 * Game process never runs this. Caster still sends CAST x,y,z; server
 * stamps the matrix on that tile.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineAreaCenters = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function findOriginInMatrix(area) {
        if (!Array.isArray(area)) return null;
        let fallback2 = null;
        for (let i = 0; i < area.length; i++) {
            const row = area[i];
            if (!Array.isArray(row)) continue;
            for (let j = 0; j < row.length; j++) {
                const v = row[j];
                if (v === 3) return { row: i, col: j, cell: 3 };
                if (v === 2 && !fallback2) fallback2 = { row: i, col: j, cell: 2 };
            }
        }
        return fallback2;
    }

    function tileOf(ent) {
        if (!ent) return null;
        if (ent.tile && ent.tile.x != null) return ent.tile;
        if (ent.x != null && ent.y != null) return ent;
        return null;
    }

    /**
     * @param {{x:number,y:number}} casterTile
     * @param {object[]} targets entities with .tile or .x/.y
     * @param {number[][]} matrix east-authored area (1/2/3 cells)
     * @param {number} [topN=10]
     * @returns {{x:number,y:number,hits:number}[]}
     */
    function findTopAreaCenters(casterTile, targets, matrix, topN) {
        if (!matrix || !targets || !targets.length || !casterTile) return [];
        if (!Array.isArray(matrix) || !matrix.length || !matrix[0] || !matrix[0].length) {
            return [];
        }
        const origin = findOriginInMatrix(matrix);
        if (!origin) return [];

        const numRows = matrix.length;
        const numCols = matrix[0].length;
        const halfH = Math.floor(numRows / 2);
        const halfW = Math.floor(numCols / 2);

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let t = 0; t < targets.length; t++) {
            const tile = tileOf(targets[t]);
            if (!tile) continue;
            if (tile.x < minX) minX = tile.x;
            if (tile.x > maxX) maxX = tile.x;
            if (tile.y < minY) minY = tile.y;
            if (tile.y > maxY) maxY = tile.y;
        }
        if (!Number.isFinite(minX)) return [];

        minX -= halfW;
        maxX += halfW;
        minY -= halfH;
        maxY += halfH;

        const candidates = [];
        for (let cx = minX; cx <= maxX; cx++) {
            for (let cy = minY; cy <= maxY; cy++) {
                let count = 0;
                for (let t = 0; t < targets.length; t++) {
                    const tile = tileOf(targets[t]);
                    if (!tile) continue;
                    const col = origin.col + (tile.x - cx);
                    const row = origin.row + (tile.y - cy);
                    if (row < 0 || row >= numRows || col < 0 || col >= numCols) continue;
                    if (matrix[row][col] >= 1) count += 1;
                }
                if (count > 0) candidates.push({ x: cx, y: cy, hits: count });
            }
        }

        const px = casterTile.x;
        const py = casterTile.y;
        candidates.sort(function (a, b) {
            if (b.hits !== a.hits) return b.hits - a.hits;
            const distA = Math.abs(a.x - px) + Math.abs(a.y - py);
            const distB = Math.abs(b.x - px) + Math.abs(b.y - py);
            if (distA !== distB) return distA - distB;
            if (a.y !== b.y) return a.y - b.y;
            return a.x - b.x;
        });

        const n = topN != null ? Math.max(0, topN | 0) : 10;
        return candidates.slice(0, n);
    }

    return {
        findOriginInMatrix,
        findTopAreaCenters
    };
});
