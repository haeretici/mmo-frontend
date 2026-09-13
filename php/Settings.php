<?php

declare(strict_types=1);

final class Settings
{
    /** @var list<array{0: string, 1: list<string>, 2: string}> */
    private const ENV_MAP = [
        ['FRONTEND_BIND', ['bind'], 'string'],
        ['FRONTEND_HTTP_PORT', ['httpPort'], 'int'],
        ['FRONTEND_LOG_LEVEL', ['logLevel'], 'string'],
        ['FRONTEND_TRUSTED_PROXY', ['trustedProxy'], 'bool'],
        ['FRONTEND_GAME_ORIGIN', ['gameOrigin'], 'string'],
        ['FRONTEND_GAME_WS_URL', ['gameWsUrl'], 'string'],
        ['FRONTEND_SITE_NAME', ['siteName'], 'string'],
        ['FRONTEND_ACCOUNT_URL', ['accountUrl'], 'string'],
        ['FRONTEND_CONTENT_PATH', ['contentPath'], 'string'],
    ];

    public static function isPlainObject(mixed $v): bool
    {
        return is_array($v) && ($v === [] || array_is_list($v) === false);
    }

    public static function toInt(mixed $v): int
    {
        if (!is_numeric($v) && !(is_string($v) && is_numeric(trim($v)))) {
            throw new RuntimeException('invalid integer setting');
        }
        $n = (int) $v;
        return $n;
    }

    public static function toBool(mixed $v): bool
    {
        $s = strtolower(trim((string) $v));
        if ($s === '1' || $s === 'true' || $s === 'yes') {
            return true;
        }
        if ($s === '0' || $s === 'false' || $s === 'no') {
            return false;
        }
        throw new RuntimeException('invalid boolean setting');
    }

    /**
     * @param array<string, mixed> $base
     * @param mixed $overlay
     * @return mixed
     */
    public static function deepMerge(array $base, mixed $overlay): mixed
    {
        if (!self::isPlainObject($overlay)) {
            return $overlay;
        }
        $out = $base;
        foreach ($overlay as $key => $v) {
            if ($v === null && !array_key_exists($key, $overlay)) {
                continue;
            }
            if (is_array($v) && array_is_list($v)) {
                $out[$key] = $v;
            } elseif (self::isPlainObject($v) && isset($out[$key]) && self::isPlainObject($out[$key])) {
                $out[$key] = self::deepMerge($out[$key], $v);
            } else {
                $out[$key] = $v;
            }
        }
        return $out;
    }

    /** @return array<string, mixed> */
    public static function readJsonObject(string $filePath): array
    {
        $text = file_get_contents($filePath);
        if ($text === false) {
            throw new RuntimeException('cannot read ' . $filePath);
        }
        $value = json_decode($text, true);
        if (!self::isPlainObject($value)) {
            throw new RuntimeException('settings file must be a JSON object: ' . $filePath);
        }
        return $value;
    }

    /**
     * @param array<string, mixed> $obj
     * @param list<string> $keys
     */
    public static function setPath(array &$obj, array $keys, mixed $value): void
    {
        $cur = &$obj;
        $last = count($keys) - 1;
        for ($i = 0; $i < $last; $i++) {
            $k = $keys[$i];
            if (!isset($cur[$k]) || !self::isPlainObject($cur[$k])) {
                $cur[$k] = [];
            }
            $cur = &$cur[$k];
        }
        $cur[$keys[$last]] = $value;
    }

    /**
     * @param array<string, mixed> $settings
     * @param array<string, string> $env
     * @return array<string, mixed>
     */
    public static function applyEnv(array $settings, array $env): array
    {
        $out = $settings;
        foreach (self::ENV_MAP as [$envKey, $pathKeys, $kind]) {
            if (!isset($env[$envKey]) || $env[$envKey] === '') {
                continue;
            }
            $raw = $env[$envKey];
            $value = $kind === 'int' ? self::toInt($raw) : ($kind === 'bool' ? self::toBool($raw) : (string) $raw);
            self::setPath($out, $pathKeys, $value);
        }
        return $out;
    }

    /**
     * @param array{root?: string, localPath?: string, env?: array<string, string>} $opts
     * @return array<string, mixed>
     */
    public static function load(array $opts = []): array
    {
        $root = $opts['root'] ?? APP_ROOT;
        $env = $opts['env'] ?? self::envArray();
        $committedPath = $root . '/config/settings.json';
        if (!is_file($committedPath)) {
            throw new RuntimeException('missing ' . $committedPath);
        }
        $merged = self::readJsonObject($committedPath);
        $localPath = $opts['localPath'] ?? $root . '/config/settings.local.json';
        if (is_file($localPath)) {
            $merged = self::deepMerge($merged, self::readJsonObject($localPath));
        }
        return self::applyEnv($merged, $env);
    }

    /** @return array<string, string> */
    public static function envArray(): array
    {
        $out = [];
        foreach ($_SERVER as $k => $v) {
            if (is_string($k) && is_string($v) && str_starts_with($k, 'FRONTEND_')) {
                $out[$k] = $v;
            }
        }
        foreach (getenv() as $k => $v) {
            if (is_string($k) && is_string($v)) {
                $out[$k] = $v;
            }
        }
        return $out;
    }

    /**
     * @param array<string, mixed> $settings
     */
    public static function resolveContentPath(array $settings, ?string $root = null): string
    {
        $base = $root ?? APP_ROOT;
        $raw = (isset($settings['contentPath']) && is_string($settings['contentPath']) && $settings['contentPath'] !== '')
            ? $settings['contentPath']
            : '../content';
        if ($raw[0] === '/' || preg_match('#^[A-Za-z]:[\\\\/]#', $raw)) {
            return $raw;
        }
        $resolved = realpath($base . DIRECTORY_SEPARATOR . $raw);
        return $resolved !== false ? $resolved : $base . DIRECTORY_SEPARATOR . $raw;
    }

    /** @param array<string, mixed> $settings */
    public static function assertBoot(array $settings): void
    {
        $port = $settings['httpPort'] ?? null;
        if (!is_numeric($port) || (int) $port < 0) {
            throw new RuntimeException('settings.httpPort must be >= 0');
        }
        if (($settings['proxyApi'] ?? true) !== false) {
            $origin = $settings['gameOrigin'] ?? '';
            $parts = is_string($origin) ? parse_url($origin) : false;
            $scheme = is_array($parts) ? ($parts['scheme'] ?? '') : '';
            if ($scheme !== 'http' && $scheme !== 'https') {
                throw new RuntimeException('settings.gameOrigin must be an http(s) URL');
            }
        }
    }

    /**
     * @param mixed $v
     * @return mixed
     */
    public static function redact(mixed $v): mixed
    {
        if (is_array($v) && array_is_list($v)) {
            return array_map([self::class, 'redact'], $v);
        }
        if (!self::isPlainObject($v)) {
            return $v;
        }
        $out = [];
        foreach ($v as $k => $val) {
            if (preg_match('/password|secret|token/i', (string) $k) || $k === 'sid') {
                $out[$k] = '***';
            } else {
                $out[$k] = self::redact($val);
            }
        }
        return $out;
    }
}
