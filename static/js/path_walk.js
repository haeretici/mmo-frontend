'use strict';

/**
 * Orthogonal BFS on the visible viewport. Client sends MOVE_PATH dirs; server validates occupancy per step.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EnginePath = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const DIRS = Object.freeze([
        Object.freeze({ dir: 0, dx: 0, dy: -1 }),
        Object.freeze({ dir: 1, dx: 1, dy: 0 }),
        Object.freeze({ dir: 2, dx: 0, dy: 1 }),
        Object.freeze({ dir: 3, dx: -1, dy: 0 })
    ]);

    function walkTile(id) {
        const n = id | 0;
        return n !== 0 && n !== 3 && n !== 4 && n !== 255;
    }

    function tileAt(viewport, x, y) {
        if (!viewport) return null;
        const lx = x - viewport.originX;
        const ly = y - viewport.originY;
        if (lx < 0 || ly < 0 || lx >= viewport.width || ly >= viewport.height) return null;
        return viewport.tiles[ly * viewport.width + lx];
    }

    function key(x, y) {
        return x + ',' + y;
    }

    function findOrthogonalPath(from, dest, isWalkable) {
        if (!from || !dest) return null;
        if ((from.x | 0) === (dest.x | 0) && (from.y | 0) === (dest.y | 0)) return [];
        const goalX = dest.x | 0;
        const goalY = dest.y | 0;
        if (typeof isWalkable !== 'function' || !isWalkable(goalX, goalY)) return null;
        const startX = from.x | 0;
        const startY = from.y | 0;
        const q = [{ x: startX, y: startY }];
        const came = new Map();
        came.set(key(startX, startY), null);
        for (let i = 0; i < q.length; i++) {
            const cur = q[i];
            if (cur.x === goalX && cur.y === goalY) break;
            for (let d = 0; d < DIRS.length; d++) {
                const step = DIRS[d];
                const nx = cur.x + step.dx;
                const ny = cur.y + step.dy;
                const k = key(nx, ny);
                if (came.has(k)) continue;
                if (!isWalkable(nx, ny)) continue;
                came.set(k, { x: cur.x, y: cur.y, dir: step.dir });
                q.push({ x: nx, y: ny });
            }
        }
        if (!came.has(key(goalX, goalY))) return null;
        const dirs = [];
        let cx = goalX;
        let cy = goalY;
        while (cx !== startX || cy !== startY) {
            const p = came.get(key(cx, cy));
            if (!p) return null;
            dirs.push(p.dir);
            cx = p.x;
            cy = p.y;
        }
        dirs.reverse();
        return dirs;
    }

    function chebyshev(ax, ay, bx, by) {
        return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
    }

    function nearestApproach(from, target, range, isWalkable) {
        if (!from || !target) return null;
        const r = Math.max(0, range | 0);
        if (chebyshev(from.x, from.y, target.x, target.y) <= r) {
            return { x: from.x | 0, y: from.y | 0 };
        }
        let best = null;
        let bestDist = Infinity;
        let bestCheb = Infinity;
        const minX = (target.x | 0) - r;
        const maxX = (target.x | 0) + r;
        const minY = (target.y | 0) - r;
        const maxY = (target.y | 0) + r;
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                if (chebyshev(x, y, target.x, target.y) > r) continue;
                if (!isWalkable(x, y)) continue;
                const path = findOrthogonalPath(from, { x: x, y: y }, isWalkable);
                if (!path) continue;
                const chebFrom = chebyshev(from.x, from.y, x, y);
                if (path.length < bestDist || (path.length === bestDist && chebFrom < bestCheb)) {
                    bestDist = path.length;
                    bestCheb = chebFrom;
                    best = { x: x, y: y };
                }
            }
        }
        return best;
    }

    return {
        DIRS,
        walkTile,
        tileAt,
        findOrthogonalPath,
        nearestApproach,
        chebyshev
    };
});
