'use strict';

/**
 * Click-to-walk A* on remembered minimap cells.
 * Eight neighbors. Cardinal cost 1, diagonal cost sqrt(2).
 * A diagonal is refused only when both side cells are blocked.
 * A cell farther than Euclidean 250 from the start is not entered.
 * The search stops after 4096 expansions.
 * Direction bytes: N0 E1 S2 W3 SW4 SE5 NW6 NE7.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.EngineMinimapPath = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const MAX_DISTANCE = 250;
    const MAX_ITERATIONS = 4096;
    const PACKET_CAP = 165;
    const SQRT2 = Math.SQRT2;
    const FLOOR_TEXT = 'You cannot walk to that floor.';
    const RANGE_TEXT = 'Destination is out of range.';

    const DIRS = Object.freeze([
        Object.freeze({ dir: 0, dx: 0, dy: -1 }),
        Object.freeze({ dir: 1, dx: 1, dy: 0 }),
        Object.freeze({ dir: 2, dx: 0, dy: 1 }),
        Object.freeze({ dir: 3, dx: -1, dy: 0 }),
        Object.freeze({ dir: 4, dx: -1, dy: 1 }),
        Object.freeze({ dir: 5, dx: 1, dy: 1 }),
        Object.freeze({ dir: 6, dx: -1, dy: -1 }),
        Object.freeze({ dir: 7, dx: 1, dy: -1 })
    ]);

    function key(x, y) {
        return x + ',' + y;
    }

    function chebyshev(ax, ay, bx, by) {
        return Math.max(Math.abs((ax | 0) - (bx | 0)), Math.abs((ay | 0) - (by | 0)));
    }

    function tooFar(ax, ay, bx, by, maxDistance) {
        const cap = maxDistance == null ? MAX_DISTANCE : Number(maxDistance);
        const dx = (ax | 0) - (bx | 0);
        const dy = (ay | 0) - (by | 0);
        return (dx * dx + dy * dy) > (cap * cap);
    }

    /**
     * True when both adjacent cardinal tiles are closed. One open side,
     * or a side the walk test cannot see, still allows the diagonal.
     */
    function diagonalClosed(x, y, dx, dy, isWalkable) {
        if (!dx || !dy || typeof isWalkable !== 'function') return false;
        return !isWalkable((x | 0) + dx, y | 0) && !isWalkable(x | 0, (y | 0) + dy);
    }

    function heuristic(dx, dy) {
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        return adx + ady + (SQRT2 - 2) * Math.min(adx, ady);
    }

    function createHeap() {
        const data = [];

        function better(a, b) {
            if (a.f !== b.f) return a.f < b.f;
            return a.h < b.h;
        }

        function up(i) {
            while (i > 0) {
                const p = (i - 1) >> 1;
                if (!better(data[i], data[p])) break;
                const tmp = data[p];
                data[p] = data[i];
                data[i] = tmp;
                i = p;
            }
        }

        function down(i) {
            const n = data.length;
            for (;;) {
                let best = i;
                const l = i * 2 + 1;
                const r = l + 1;
                if (l < n && better(data[l], data[best])) best = l;
                if (r < n && better(data[r], data[best])) best = r;
                if (best === i) break;
                const tmp = data[best];
                data[best] = data[i];
                data[i] = tmp;
                i = best;
            }
        }

        return {
            size: function () { return data.length; },
            push: function (item) {
                data.push(item);
                up(data.length - 1);
            },
            pop: function () {
                if (!data.length) return null;
                const top = data[0];
                const last = data.pop();
                if (data.length) {
                    data[0] = last;
                    down(0);
                }
                return top;
            }
        };
    }

    function reconstructDirs(node) {
        const dirs = [];
        let cur = node;
        while (cur && cur.parent) {
            dirs.push(cur.dir);
            cur = cur.parent;
        }
        dirs.reverse();
        return dirs;
    }

    function findPath(from, dest, isWalkable, options) {
        if (!from || !dest || typeof isWalkable !== 'function') return null;
        const sx = from.x | 0;
        const sy = from.y | 0;
        const gx = dest.x | 0;
        const gy = dest.y | 0;
        if (from.z != null && dest.z != null && (from.z | 0) !== (dest.z | 0)) return null;
        if (sx === gx && sy === gy) return [];
        const maxDistance = options && options.maxDistance != null
            ? Number(options.maxDistance)
            : MAX_DISTANCE;
        const maxIterations = options && options.maxIterations != null
            ? (options.maxIterations | 0)
            : MAX_ITERATIONS;
        if (tooFar(sx, sy, gx, gy, maxDistance)) return null;
        if (!isWalkable(gx, gy)) return null;

        const open = createHeap();
        const gScore = new Map();
        const startH = heuristic(sx - gx, sy - gy);
        gScore.set(key(sx, sy), 0);
        open.push({
            x: sx,
            y: sy,
            g: 0,
            h: startH,
            f: startH,
            parent: null,
            dir: -1
        });

        let expanded = 0;
        while (open.size() > 0) {
            const current = open.pop();
            if (!current) break;
            const bestG = gScore.get(key(current.x, current.y));
            if (bestG !== undefined && current.g > bestG) continue;
            if (current.x === gx && current.y === gy) return reconstructDirs(current);
            expanded += 1;
            if (expanded > maxIterations) return null;
            for (let d = 0; d < DIRS.length; d++) {
                const step = DIRS[d];
                const nx = current.x + step.dx;
                const ny = current.y + step.dy;
                if (tooFar(sx, sy, nx, ny, maxDistance)) continue;
                if (!isWalkable(nx, ny)) continue;
                if (step.dx && step.dy && diagonalClosed(current.x, current.y, step.dx, step.dy, isWalkable)) {
                    continue;
                }
                const moveCost = step.dx && step.dy ? SQRT2 : 1;
                const tentative = current.g + moveCost;
                const k = key(nx, ny);
                const prev = gScore.get(k);
                if (prev !== undefined && tentative >= prev) continue;
                gScore.set(k, tentative);
                const h = heuristic(nx - gx, ny - gy);
                open.push({
                    x: nx,
                    y: ny,
                    g: tentative,
                    h: h,
                    f: tentative + h,
                    parent: current,
                    dir: step.dir
                });
            }
        }
        return null;
    }

    function nearestApproach(from, target, range, isWalkable) {
        if (!from || !target || typeof isWalkable !== 'function') return null;
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
                const path = findPath(from, { x: x, y: y }, isWalkable);
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

    /**
     * Minimap or canvas click, before the search.
     * Missing dest.z means the player's floor.
     */
    function clickPlan(player, dest, maxDistance) {
        if (!player || !dest) return { type: 'ignore' };
        const z = dest.z == null ? (player.z | 0) : (dest.z | 0);
        if (z !== (player.z | 0)) return { type: 'text', text: FLOOR_TEXT };
        if ((dest.x | 0) === (player.x | 0) && (dest.y | 0) === (player.y | 0)) {
            return { type: 'arrive' };
        }
        if (tooFar(player.x, player.y, dest.x, dest.y, maxDistance)) {
            return { type: 'text', text: RANGE_TEXT };
        }
        return { type: 'search', x: dest.x | 0, y: dest.y | 0, z: z };
    }

    function clipSteps(dirs, cap) {
        const n = cap == null ? PACKET_CAP : (cap | 0);
        if (!dirs || !dirs.length || n <= 0) return [];
        if (dirs.length <= n) return dirs.slice();
        return dirs.slice(0, n);
    }

    /**
     * One server step of a click-walk. `left` is the queued count before
     * this step. Same floor only: the last queued step searches again
     * when the destination is still ahead.
     */
    function afterStep(left, arrived, sameFloor) {
        if (arrived) return 'arrive';
        if (!sameFloor) return 'cancel-floor';
        if ((left | 0) > 1) return 'wait';
        return 'continue';
    }

    return {
        MAX_DISTANCE: MAX_DISTANCE,
        MAX_ITERATIONS: MAX_ITERATIONS,
        PACKET_CAP: PACKET_CAP,
        FLOOR_TEXT: FLOOR_TEXT,
        RANGE_TEXT: RANGE_TEXT,
        DIRS: DIRS,
        chebyshev: chebyshev,
        tooFar: tooFar,
        diagonalClosed: diagonalClosed,
        findPath: findPath,
        nearestApproach: nearestApproach,
        clickPlan: clickPlan,
        clipSteps: clipSteps,
        afterStep: afterStep
    };
});
