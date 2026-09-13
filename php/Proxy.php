<?php

declare(strict_types=1);

final class Proxy
{
    private const HOP = [
        'connection' => true,
        'keep-alive' => true,
        'proxy-authenticate' => true,
        'proxy-authorization' => true,
        'te' => true,
        'trailers' => true,
        'transfer-encoding' => true,
        'upgrade' => true,
        'http2-settings' => true,
    ];

    /** @param array<string, mixed> $settings */
    public static function fetchJson(string $url, int $timeoutMs): ?array
    {
        try {
            $raw = self::request('GET', $url, [], null, $timeoutMs);
        } catch (Throwable) {
            return null;
        }
        $json = json_decode($raw['body'], true);
        return is_array($json) ? $json : null;
    }

    /** @param array<string, mixed> $settings */
    public static function api(array $settings): never
    {
        $origin = (string) ($settings['gameOrigin'] ?? '');
        $uri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
        $path = parse_url($uri, PHP_URL_PATH);
        if ($path === '/v1/ws') {
            Http::sendJson(404, ['error' => 'not_found']);
        }
        $target = rtrim($origin, '/') . $uri;
        $parts = parse_url($target);
        if (!is_array($parts) || empty($parts['host'])) {
            Http::sendJson(400, ['error' => 'unprocessable']);
        }
        $timeoutMs = (int) (($settings['limits']['proxyTimeoutMs'] ?? 15000) ?: 15000);
        $headers = self::incomingHeaders($settings, $parts);
        $body = file_get_contents('php://input');
        if ($body === false) {
            $body = '';
        }
        try {
            $res = self::request(Http::method(), $target, $headers, $body, $timeoutMs);
        } catch (Throwable $e) {
            $msg = $e->getMessage();
            if (str_contains($msg, 'timeout')) {
                Http::sendJson(504, ['error' => 'gateway_timeout']);
            }
            Http::sendJson(502, ['error' => 'bad_gateway']);
        }
        http_response_code($res['status']);
        foreach ($res['headers'] as $name => $values) {
            $low = strtolower($name);
            if (isset(self::HOP[$low]) || $low === 'content-length') {
                continue;
            }
            foreach ($values as $i => $v) {
                header($name . ': ' . $v, $i === 0);
            }
        }
        header('X-Content-Type-Options: nosniff');
        echo $res['body'];
        exit;
    }

    /**
     * @param array<string, mixed> $settings
     * @param array<string, mixed> $targetParts
     * @return list<string>
     */
    private static function incomingHeaders(array $settings, array $targetParts): array
    {
        $out = [];
        foreach (self::requestHeaders() as $name => $value) {
            $low = strtolower($name);
            if (isset(self::HOP[$low]) || $low === 'host' || $low === 'content-length') {
                continue;
            }
            $out[] = $name . ': ' . $value;
        }
        $host = $targetParts['host'];
        if (isset($targetParts['port'])) {
            $host .= ':' . $targetParts['port'];
        }
        $out[] = 'Host: ' . $host;
        $remote = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
        $prior = (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '');
        $out[] = 'X-Forwarded-For: ' . ($prior !== '' ? $prior . ', ' . $remote : $remote);
        $proto = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $out[] = 'X-Forwarded-Proto: ' . $proto;
        return $out;
    }

    /** @return array<string, string> */
    private static function requestHeaders(): array
    {
        if (function_exists('getallheaders')) {
            $h = getallheaders();
            if (is_array($h)) {
                $out = [];
                foreach ($h as $k => $v) {
                    if (is_string($k) && is_string($v)) {
                        $out[$k] = $v;
                    }
                }
                return $out;
            }
        }
        $out = [];
        foreach ($_SERVER as $k => $v) {
            if (!is_string($k) || !str_starts_with($k, 'HTTP_') || !is_string($v)) {
                continue;
            }
            $name = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($k, 5)))));
            $out[$name] = $v;
        }
        if (isset($_SERVER['CONTENT_TYPE']) && is_string($_SERVER['CONTENT_TYPE'])) {
            $out['Content-Type'] = $_SERVER['CONTENT_TYPE'];
        }
        return $out;
    }

    /**
     * @param list<string> $headers
     * @return array{status: int, headers: array<string, list<string>>, body: string}
     */
    private static function request(string $method, string $url, array $headers, ?string $body, int $timeoutMs): array
    {
        if (!function_exists('curl_init')) {
            throw new RuntimeException('curl required');
        }
        $ch = curl_init($url);
        if ($ch === false) {
            throw new RuntimeException('curl init');
        }
        $headerLines = [];
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HEADER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT_MS => max(1, $timeoutMs),
            CURLOPT_CONNECTTIMEOUT_MS => max(1, min(3000, $timeoutMs)),
        ]);
        if ($body !== null && $method !== 'GET' && $method !== 'HEAD') {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
        $raw = curl_exec($ch);
        if ($raw === false) {
            $err = curl_error($ch);
            $errno = curl_errno($ch);
            curl_close($ch);
            if ($errno === CURLE_OPERATION_TIMEDOUT) {
                throw new RuntimeException('timeout');
            }
            throw new RuntimeException($err !== '' ? $err : 'curl');
        }
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        curl_close($ch);
        $headerBlob = substr($raw, 0, $headerSize);
        $bodyOut = substr($raw, $headerSize);
        $parsed = [];
        foreach (preg_split("/\r\n|\n|\r/", $headerBlob) ?: [] as $line) {
            if (!str_contains($line, ':')) {
                continue;
            }
            [$n, $v] = explode(':', $line, 2);
            $n = trim($n);
            $v = ltrim($v);
            if ($n === '') {
                continue;
            }
            $parsed[$n] ??= [];
            $parsed[$n][] = $v;
        }
        return ['status' => $status ?: 502, 'headers' => $parsed, 'body' => $bodyOut];
    }
}
