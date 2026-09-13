<?php

declare(strict_types=1);

/**
 * Play visual HTTP. Crops hybrid sub_* windows and serves sprite PNGs.
 * MUST NOT send spawns, world pins, creature kits, or friction channels.
 * MUST NOT gunzip sub_* in the game process — this is the www PHP renderer.
 */
final class Visual
{
    public const MAX_WINDOW = 64;
    public const DEFAULT_GENRE = 'rpg_fantasy';
    public const SPRITE_PREFIX = '/sprites/';
    public const VISUAL_PATH = '/visual';

    /** @var list<string> */
    public const VISUAL_LAYERS = ['ground', 'path', 'scenery', 'furniture', 'vertical'];

    /** @var list<string> */
    private const SPRITE_KINDS = [
        'creatures',
        'tiles',
        'overlays',
        'objects',
        'equipment',
        'ui',
    ];

    /** @var list<string> */
    private const SPRITE_VARIANTS = [
        'icon',
        'small',
        'medium',
        'original',
        'alpha',
        'retro',
    ];

    /** @var array<string, string> */
    private static array $u16Cache = [];

    /** @var array<string, array<string, array<string, mixed>>> */
    private static array $roleCatalogs = [];

    /**
     * @param array<string, mixed> $settings
     */
    public static function try(string $pathname, array $settings): bool
    {
        if (Http::method() !== 'GET' && Http::method() !== 'HEAD') {
            return false;
        }
        $contentRoot = Settings::resolveContentPath($settings);
        if ($pathname === self::VISUAL_PATH) {
            self::sendWindow($contentRoot);
        }
        if (str_starts_with($pathname, self::SPRITE_PREFIX)) {
            return self::sendSprite($contentRoot, substr($pathname, strlen(self::SPRITE_PREFIX)));
        }
        return false;
    }

    public static function isSpritePath(string $pathname): bool
    {
        return $pathname === '/sprites' || str_starts_with($pathname, self::SPRITE_PREFIX);
    }

    /**
     * @param array<string, mixed> $query
     * @return array<string, mixed>
     */
    public static function window(string $contentRoot, array $query): array
    {
        $mapId = self::resolveMapId($contentRoot, isset($query['map']) ? (string) $query['map'] : '');
        $z = Pack::asInt($query['z'] ?? null, 0);
        if ($z < Pack::MIN_Z || $z > Pack::MAX_Z) {
            throw new InvalidArgumentException('bad z');
        }
        $reqW = Pack::asInt($query['w'] ?? null, 32);
        $reqH = Pack::asInt($query['h'] ?? null, 32);
        if ($reqW < 1 || $reqH < 1 || $reqW > self::MAX_WINDOW || $reqH > self::MAX_WINDOW) {
            throw new InvalidArgumentException('bad window');
        }
        $reqX = Pack::asInt($query['x'] ?? null, 0);
        $reqY = Pack::asInt($query['y'] ?? null, 0);

        $genre = self::genreForMap($contentRoot, $mapId);
        $floorDir = $contentRoot . '/maps/' . $mapId . '/hybrid/floor-' . Hybrid::floorPad($z);
        $metaPath = $floorDir . DIRECTORY_SEPARATOR . Hybrid::META_NAME;
        if (!is_file($metaPath)) {
            return [
                'ok' => true,
                'present' => false,
                'mapId' => $mapId,
                'z' => $z,
                'genre' => $genre,
                'originX' => max(0, $reqX),
                'originY' => max(0, $reqY),
                'width' => $reqW,
                'height' => $reqH,
                'mapCols' => 0,
                'mapRows' => 0,
                'palette' => [null],
                'layers' => (object) [],
            ];
        }

        $meta = Pack::readJson($metaPath);
        if (!Pack::isPlainObject($meta)) {
            throw new RuntimeException('invalid hybrid map.json');
        }
        $fm = self::floorMeta($meta, $z);
        $cols = Pack::asInt($fm['cols'] ?? null, 0);
        $rows = Pack::asInt($fm['rows'] ?? null, 0);
        if ($cols < 1 || $rows < 1) {
            throw new RuntimeException('hybrid floor missing cols/rows');
        }

        $w = min($reqW, $cols, self::MAX_WINDOW);
        $h = min($reqH, $rows, self::MAX_WINDOW);
        $x = max(0, min($reqX, $cols - $w));
        $y = max(0, min($reqY, $rows - $h));

        $roles = self::roleCatalog($contentRoot);
        $palette = self::visualPalette(isset($fm['palette']) && is_array($fm['palette']) ? $fm['palette'] : [null], $roles);
        $layers = [];
        $subList = isset($fm['subLayers']) && is_array($fm['subLayers']) ? $fm['subLayers'] : [];
        $nBytes = $cols * $rows * 2;
        foreach (self::VISUAL_LAYERS as $id) {
            $rel = self::subBlobRel($subList, $id);
            $raw = null;
            if ($rel !== null) {
                $safe = Hybrid::safeBlobRel($rel);
                $abs = Hybrid::resolveUnder($floorDir, $safe);
                if (is_file($abs)) {
                    $raw = self::loadU16($abs, $nBytes);
                }
            }
            $layers[$id] = base64_encode(self::cropU16($raw, $cols, $rows, $x, $y, $w, $h));
        }

        return [
            'ok' => true,
            'present' => true,
            'mapId' => $mapId,
            'z' => $z,
            'genre' => $genre,
            'originX' => $x,
            'originY' => $y,
            'width' => $w,
            'height' => $h,
            'mapCols' => $cols,
            'mapRows' => $rows,
            'palette' => $palette,
            'layers' => $layers,
        ];
    }

    public static function cropU16(?string $raw, int $cols, int $rows, int $x0, int $y0, int $w, int $h): string
    {
        $need = $cols * $rows * 2;
        if ($raw === null || $raw === '') {
            return str_repeat("\0", $w * $h * 2);
        }
        if (strlen($raw) < $need) {
            $raw = str_pad($raw, $need, "\0");
        }
        $out = '';
        $rowBytes = $w * 2;
        for ($y = 0; $y < $h; $y++) {
            $srcY = $y0 + $y;
            if ($srcY < 0 || $srcY >= $rows) {
                $out .= str_repeat("\0", $rowBytes);
                continue;
            }
            $srcX = $x0;
            if ($srcX < 0) {
                $pad = min($w, -$srcX);
                $out .= str_repeat("\0", $pad * 2);
                $take = $w - $pad;
                if ($take > 0) {
                    $out .= substr($raw, ($srcY * $cols) * 2, $take * 2);
                }
                continue;
            }
            $out .= substr($raw, ($srcY * $cols + $srcX) * 2, $rowBytes);
        }
        return $out;
    }

    public static function defaultMapId(string $contentRoot): string
    {
        $packFile = $contentRoot . DIRECTORY_SEPARATOR . 'pack.json';
        if (is_file($packFile)) {
            try {
                $pack = Pack::readJson($packFile);
                if (Pack::isPlainObject($pack) && isset($pack['defaultMap'])) {
                    $id = (string) $pack['defaultMap'];
                    if (preg_match(Pack::KIND_RE, $id)) {
                        return $id;
                    }
                }
            } catch (Throwable $e) {
                // fall through
            }
        }
        return 'firstlight_isle';
    }

    private static function sendWindow(string $contentRoot): never
    {
        try {
            $doc = self::window($contentRoot, $_GET);
        } catch (InvalidArgumentException $e) {
            Http::sendJson(400, ['error' => 'bad_request']);
        } catch (Throwable $e) {
            Http::sendJson(404, ['error' => 'not_found']);
        }
        $buf = json_encode($doc, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($buf === false) {
            Http::sendJson(500, ['error' => 'internal']);
        }
        http_response_code(200);
        header('Content-Type: application/json; charset=utf-8');
        header('Content-Length: ' . strlen($buf));
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        if (Http::method() !== 'HEAD') {
            echo $buf;
        }
        exit;
    }

    private static function sendSprite(string $contentRoot, string $rel): bool
    {
        $rel = self::cleanSpriteRel($rel);
        if ($rel === null) {
            return false;
        }
        $root = realpath($contentRoot . DIRECTORY_SEPARATOR . 'sprites');
        if ($root === false) {
            return false;
        }
        $abs = $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel);
        $real = realpath($abs);
        if ($real === false || ($real !== $root && !str_starts_with($real, $root . DIRECTORY_SEPARATOR))) {
            return false;
        }
        if (!is_file($real) || str_starts_with(basename($real), '.')) {
            return false;
        }
        if (strtolower(pathinfo($real, PATHINFO_EXTENSION)) !== 'png') {
            return false;
        }
        header('Content-Type: image/png');
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: public, max-age=3600');
        header('Content-Length: ' . (string) filesize($real));
        if (Http::method() !== 'HEAD') {
            readfile($real);
        }
        return true;
    }

    private static function cleanSpriteRel(string $rel): ?string
    {
        $rel = str_replace('\\', '/', rawurldecode($rel));
        $rel = ltrim($rel, '/');
        if ($rel === '' || str_contains($rel, "\0") || str_contains($rel, '..')) {
            return null;
        }
        $parts = [];
        foreach (explode('/', $rel) as $p) {
            if ($p === '' || $p === '.') {
                continue;
            }
            if ($p === '..' || str_starts_with($p, '.')) {
                return null;
            }
            $parts[] = $p;
        }
        if (count($parts) !== 4) {
            return null;
        }
        [$genre, $kind, $variant, $file] = $parts;
        if (!preg_match('/^[a-z][a-z0-9_]{0,39}$/', $genre)) {
            return null;
        }
        if (!in_array($kind, self::SPRITE_KINDS, true)) {
            return null;
        }
        if (!in_array($variant, self::SPRITE_VARIANTS, true)) {
            return null;
        }
        if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}\.png$/', $file)) {
            return null;
        }
        return implode('/', $parts);
    }

    private static function resolveMapId(string $contentRoot, string $requested): string
    {
        $id = $requested !== '' ? $requested : self::defaultMapId($contentRoot);
        if (!preg_match(Pack::KIND_RE, $id)) {
            throw new InvalidArgumentException('bad map');
        }
        $dir = $contentRoot . '/maps/' . $id;
        if (!is_dir($dir) || !is_file($dir . '/bounds.json')) {
            throw new RuntimeException('unknown map');
        }
        return $id;
    }

    private static function genreForMap(string $contentRoot, string $mapId): string
    {
        $art = $contentRoot . '/art_sets/' . $mapId . '.json';
        if (is_file($art)) {
            try {
                $doc = Pack::readJson($art);
                if (Pack::isPlainObject($doc) && isset($doc['genre'])) {
                    $g = (string) $doc['genre'];
                    if (preg_match('/^[a-z][a-z0-9_]{0,39}$/', $g)) {
                        return $g;
                    }
                }
            } catch (Throwable $e) {
                // default
            }
        }
        return self::DEFAULT_GENRE;
    }

    /**
     * @param array<string, mixed> $meta
     * @return array<string, mixed>
     */
    private static function floorMeta(array $meta, int $z): array
    {
        $list = isset($meta['floors']) && is_array($meta['floors']) ? $meta['floors'] : [];
        foreach ($list as $fm) {
            if (!Pack::isPlainObject($fm)) {
                continue;
            }
            if (Pack::asInt($fm['z'] ?? null, -1) === $z) {
                return $fm;
            }
        }
        if ($list !== [] && Pack::isPlainObject($list[0])) {
            return $list[0];
        }
        throw new RuntimeException('hybrid floor missing');
    }

    /**
     * @param list<mixed> $palette
     * @param array<string, array<string, mixed>> $roles
     * @return list<array<string, mixed>|null>
     */
    private static function visualPalette(array $palette, array $roles): array
    {
        $out = [];
        foreach ($palette as $i => $slot) {
            if ($i === 0 || $slot === null || !is_array($slot)) {
                $out[] = null;
                continue;
            }
            $kind = isset($slot['kind']) ? (string) $slot['kind'] : 'tiles';
            if ($kind !== 'objects' && $kind !== 'tiles' && $kind !== 'overlays') {
                $kind = 'tiles';
            }
            $catalogId = '';
            if (isset($slot['catalogId'])) {
                $catalogId = (string) $slot['catalogId'];
            } elseif (isset($slot['id'])) {
                $catalogId = (string) $slot['id'];
            }
            $roleId = isset($slot['roleId']) ? (string) $slot['roleId'] : '';
            $role = $roleId !== '' && isset($roles[$roleId]) ? $roles[$roleId] : null;
            $scale = 1.0;
            $anchor = $kind === 'objects' ? 'bottom_center' : 'middle_center';
            $variant = '';
            if (is_array($role) && isset($role['render']) && is_array($role['render'])) {
                $r = $role['render'];
                if (isset($r['scale']) && is_numeric($r['scale'])) {
                    $scale = (float) $r['scale'];
                }
                if (isset($r['anchor']) && is_string($r['anchor']) && $r['anchor'] !== '') {
                    $anchor = strtolower($r['anchor']);
                }
                if (isset($r['variant']) && is_string($r['variant'])) {
                    $variant = strtolower($r['variant']);
                }
            }
            if (isset($slot['scale']) && is_numeric($slot['scale'])) {
                $scale = (float) $slot['scale'];
            }
            if (isset($slot['anchor']) && is_string($slot['anchor']) && $slot['anchor'] !== '') {
                $anchor = strtolower($slot['anchor']);
            }
            if (isset($slot['variant']) && is_string($slot['variant']) && $slot['variant'] !== '') {
                $variant = strtolower($slot['variant']);
            }
            if ($scale < 0.05) {
                $scale = 0.05;
            }
            if ($scale > 8) {
                $scale = 8.0;
            }
            $row = [
                'catalogId' => $catalogId,
                'kind' => $kind,
                'scale' => $scale,
                'anchor' => $anchor,
            ];
            if ($roleId !== '') {
                $row['roleId'] = $roleId;
            }
            if ($variant !== '') {
                $row['variant'] = $variant;
            }
            $out[] = $row;
        }
        if ($out === []) {
            $out[] = null;
        }
        return $out;
    }

    /**
     * @param list<mixed> $subList
     */
    private static function subBlobRel(array $subList, string $id): ?string
    {
        foreach ($subList as $sl) {
            if (!is_array($sl)) {
                continue;
            }
            if ((string) ($sl['id'] ?? '') !== $id) {
                continue;
            }
            if (!empty($sl['empty']) || empty($sl['blob']) || !is_string($sl['blob'])) {
                return null;
            }
            return $sl['blob'];
        }
        return null;
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private static function roleCatalog(string $contentRoot): array
    {
        if (isset(self::$roleCatalogs[$contentRoot])) {
            return self::$roleCatalogs[$contentRoot];
        }
        $dir = $contentRoot . DIRECTORY_SEPARATOR . 'tile_roles';
        $out = [];
        if (is_dir($dir)) {
            try {
                $out = Pack::loadKeyedDir($dir);
            } catch (Throwable $e) {
                $out = [];
            }
        }
        self::$roleCatalogs[$contentRoot] = $out;
        return $out;
    }

    private static function loadU16(string $abs, int $nBytes): string
    {
        $size = filesize($abs);
        $mtime = filemtime($abs);
        $key = $abs . ':' . (string) $size . ':' . (string) $mtime;
        if (isset(self::$u16Cache[$key])) {
            return self::$u16Cache[$key];
        }
        $raw = Hybrid::gunzipBytes((string) file_get_contents($abs), $abs);
        if (strlen($raw) < $nBytes) {
            $raw = str_pad($raw, $nBytes, "\0");
        }
        if (strlen($raw) <= 524288) {
            if (count(self::$u16Cache) > 24) {
                self::$u16Cache = [];
            }
            self::$u16Cache[$key] = $raw;
        }
        return $raw;
    }
}
