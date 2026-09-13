<?php

declare(strict_types=1);

final class Http
{
    public const PRETTY = [
        '/' => 'index.html',
        '/login' => 'login.html',
        '/register' => 'register.html',
        '/account' => 'account.html',
        '/play' => 'play.html',
        '/wiki' => 'wiki.html',
    ];

    public const MIME = [
        'html' => 'text/html; charset=utf-8',
        'css' => 'text/css; charset=utf-8',
        'js' => 'text/javascript; charset=utf-8',
        'json' => 'application/json; charset=utf-8',
        'svg' => 'image/svg+xml',
        'png' => 'image/png',
        'ico' => 'image/x-icon',
    ];

    public const DENY_PREFIX = ['/config', '/php', '/tests', '/src', '/bin', '/node_modules'];

    public static function requestPath(): string
    {
        $uri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
        $path = parse_url($uri, PHP_URL_PATH);
        if (!is_string($path) || $path === '') {
            return '/';
        }
        if ($path !== '/' && str_ends_with($path, '/')) {
            $path = rtrim($path, '/');
        }
        if ($path === '/index.php') {
            return '/';
        }
        return $path;
    }

    public static function method(): string
    {
        return strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    }

    public static function normalizeIp(string $ip): string
    {
        if (str_starts_with($ip, '::ffff:')) {
            $ip = substr($ip, 7);
        }
        return $ip !== '' ? $ip : '0.0.0.0';
    }

    /** @param array<string, mixed> $settings */
    public static function clientIp(array $settings): string
    {
        $remote = self::normalizeIp((string) ($_SERVER['REMOTE_ADDR'] ?? ''));
        if (empty($settings['trustedProxy'])) {
            return $remote;
        }
        $xff = (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '');
        if (trim($xff) === '') {
            return $remote;
        }
        $first = trim(explode(',', $xff)[0]);
        return $first !== '' ? self::normalizeIp($first) : $remote;
    }

    /** @param array<string, string> $extra */
    public static function sendJson(int $status, mixed $obj, array $extra = []): never
    {
        http_response_code($status);
        $buf = json_encode($obj, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($buf === false) {
            $buf = '{"error":"internal"}';
        }
        header('Content-Type: application/json; charset=utf-8');
        header('Content-Length: ' . strlen($buf));
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        foreach ($extra as $k => $v) {
            header($k . ': ' . $v);
        }
        echo $buf;
        exit;
    }

    public static function deniedPath(string $pathname): bool
    {
        foreach (self::DENY_PREFIX as $p) {
            if ($pathname === $p || str_starts_with($pathname, $p . '/')) {
                return true;
            }
        }
        return false;
    }

    public static function safeRel(string $urlPath, string $staticRoot): ?string
    {
        $pretty = self::PRETTY[$urlPath] ?? null;
        $rel = $pretty ?? rawurldecode(ltrim($urlPath, '/'));
        if ($rel === '' || str_contains($rel, "\0")) {
            return null;
        }
        $root = realpath($staticRoot);
        if ($root === false) {
            return null;
        }
        $abs = $staticRoot . DIRECTORY_SEPARATOR . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $rel);
        $real = realpath($abs);
        if ($real === false) {
            // unresolved path — still reject .. after normalize
            $norm = self::normalizeJoin($staticRoot, $rel);
            if ($norm === null) {
                return null;
            }
            $base = basename($norm);
            if (str_starts_with($base, '.')) {
                return null;
            }
            return $norm;
        }
        $rootSep = $root . DIRECTORY_SEPARATOR;
        if ($real !== $root && !str_starts_with($real, $rootSep)) {
            return null;
        }
        if (str_starts_with(basename($real), '.')) {
            return null;
        }
        return $real;
    }

    public static function normalizeJoin(string $root, string $rel): ?string
    {
        $parts = [];
        foreach (explode('/', str_replace('\\', '/', $rel)) as $p) {
            if ($p === '' || $p === '.') {
                continue;
            }
            if ($p === '..') {
                return null;
            }
            $parts[] = $p;
        }
        return rtrim($root, '/\\') . DIRECTORY_SEPARATOR . implode(DIRECTORY_SEPARATOR, $parts);
    }

    /** @param array<string, mixed> $settings */
    public static function tryStatic(string $pathname, array $settings): bool
    {
        if (self::method() !== 'GET' && self::method() !== 'HEAD') {
            return false;
        }
        if (self::deniedPath($pathname)) {
            return false;
        }
        $abs = self::safeRel($pathname, APP_STATIC);
        if ($abs === null || !is_file($abs)) {
            return false;
        }
        $ext = strtolower(pathinfo($abs, PATHINFO_EXTENSION));
        $type = self::MIME[$ext] ?? 'application/octet-stream';
        $nocache = $ext === 'html' || $ext === 'json';
        header('Content-Type: ' . $type);
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: ' . ($nocache ? 'no-store' : 'public, max-age=3600'));
        header('Content-Security-Policy: ' . ClientConfig::csp($settings));
        header('Content-Length: ' . (string) filesize($abs));
        if (self::method() !== 'HEAD') {
            readfile($abs);
        }
        return true;
    }

    /** @return array<string, mixed> */
    public static function readJsonBody(int $maxBytes): array
    {
        $declared = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        if ($declared > $maxBytes) {
            self::sendJson(413, ['error' => 'payload_too_large']);
        }
        $raw = file_get_contents('php://input');
        if ($raw === false) {
            $raw = '';
        }
        if (strlen($raw) > $maxBytes) {
            self::sendJson(413, ['error' => 'payload_too_large']);
        }
        if ($raw === '') {
            return [];
        }
        $value = json_decode($raw, true);
        if (!is_array($value) || array_is_list($value)) {
            self::sendJson(422, ['error' => 'unprocessable']);
        }
        return $value;
    }
}
