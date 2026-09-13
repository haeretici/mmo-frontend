<?php

declare(strict_types=1);

final class Router
{
    /** @param array<string, mixed> $settings */
    public static function dispatch(array $settings): void
    {
        try {
            Settings::assertBoot($settings);
        } catch (Throwable $e) {
            Http::sendJson(500, ['error' => 'internal']);
        }

        $path = Http::requestPath();
        $method = Http::method();
        $ip = Http::clientIp($settings);
        $exempt = $path === '/health' || $path === '/ready' || Visual::isSpritePath($path);
        $maxHttp = (int) (($settings['limits']['maxHttpPerIpPerMin'] ?? 0) ?: 0);
        if (!$exempt && $maxHttp > 0 && !Gate::allowHttp($ip, $maxHttp)) {
            Http::sendJson(429, ['error' => 'too_many_requests']);
        }

        if ($method === 'GET' && $path === '/health') {
            Http::sendJson(200, ['ok' => true, 'site' => true, 'metrics' => Gate::$metrics]);
        }

        if ($method === 'GET' && $path === '/ready') {
            $game = Proxy::fetchJson(rtrim((string) $settings['gameOrigin'], '/') . '/ready', 3000);
            $ready = is_array($game) && !empty($game['ok']);
            Http::sendJson($ready ? 200 : 503, ['ok' => $ready, 'site' => true, 'game' => $game]);
        }

        if ($method === 'GET' && $path === '/client-config.json') {
            $buf = json_encode(ClientConfig::public($settings), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            if ($buf === false) {
                Http::sendJson(500, ['error' => 'internal']);
            }
            http_response_code(200);
            header('Content-Type: application/json; charset=utf-8');
            header('Content-Length: ' . strlen($buf));
            header('Cache-Control: no-store');
            header('X-Content-Type-Options: nosniff');
            header('Content-Security-Policy: ' . ClientConfig::csp($settings));
            echo $buf;
            exit;
        }

        if ($path === '/v1/ws') {
            Http::sendJson(404, ['error' => 'not_found']);
        }

        if (($settings['proxyApi'] ?? true) !== false && str_starts_with($path, '/v1/')) {
            Proxy::api($settings);
        }

        if (Visual::try($path, $settings)) {
            exit;
        }

        if (($method === 'GET' || $method === 'HEAD') && ($path === '/content/equipment.json' || $path === '/equipment.json')) {
            $contentRoot = Settings::resolveContentPath($settings);
            $file = $contentRoot . DIRECTORY_SEPARATOR . 'equipment.json';
            if (is_file($file)) {
                http_response_code(200);
                header('Content-Type: application/json; charset=utf-8');
                header('Content-Length: ' . (string) filesize($file));
                header('Cache-Control: public, max-age=3600');
                header('X-Content-Type-Options: nosniff');
                header('Content-Security-Policy: ' . ClientConfig::csp($settings));
                if ($method !== 'HEAD') {
                    readfile($file);
                }
                exit;
            }
        }


        if (Http::tryStatic($path, $settings)) {
            exit;
        }

        Http::sendJson(404, ['error' => 'not_found']);
    }
}
