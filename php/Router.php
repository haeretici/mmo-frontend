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

        if (($method === 'GET' || $method === 'HEAD') && ($path === '/content/classes-ui.json' || $path === '/classes-ui.json')) {
            $contentRoot = Settings::resolveContentPath($settings);
            $file = $contentRoot . DIRECTORY_SEPARATOR . 'classes.json';
            if (is_file($file)) {
                $raw = json_decode((string) file_get_contents($file), true);
                $doc = self::classesUi($raw);
                $buf = json_encode($doc, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
                if ($buf === false) {
                    Http::sendJson(500, ['error' => 'internal']);
                }
                http_response_code(200);
                header('Content-Type: application/json; charset=utf-8');
                header('Content-Length: ' . (string) strlen($buf));
                header('Cache-Control: public, max-age=3600');
                header('X-Content-Type-Options: nosniff');
                header('Content-Security-Policy: ' . ClientConfig::csp($settings));
                if ($method !== 'HEAD') {
                    echo $buf;
                }
                exit;
            }
        }

        if (($method === 'GET' || $method === 'HEAD') && ($path === '/content/spells-ui.json' || $path === '/spells-ui.json')) {
            $contentRoot = Settings::resolveContentPath($settings);
            $file = $contentRoot . DIRECTORY_SEPARATOR . 'spells.json';
            if (is_file($file)) {
                $raw = json_decode((string) file_get_contents($file), true);
                $doc = self::spellsUi($raw);
                $buf = json_encode($doc, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
                if ($buf === false) {
                    Http::sendJson(500, ['error' => 'internal']);
                }
                http_response_code(200);
                header('Content-Type: application/json; charset=utf-8');
                header('Content-Length: ' . (string) strlen($buf));
                header('Cache-Control: public, max-age=3600');
                header('X-Content-Type-Options: nosniff');
                header('Content-Security-Policy: ' . ClientConfig::csp($settings));
                if ($method !== 'HEAD') {
                    echo $buf;
                }
                exit;
            }
        }


        if (Http::tryStatic($path, $settings)) {
            exit;
        }

        Http::sendJson(404, ['error' => 'not_found']);
    }

    /**
     * Display-only spell catalog. MUST NOT include powerCurve / basePower /
     * damageAmplitude / delayed fuse / field damage.
     *
     * @param mixed $raw
     * @return array{spells: list<array<string, mixed>>}
     */
    public static function spellsUi(mixed $raw): array
    {
        $out = ['spells' => []];
        $list = is_array($raw) && isset($raw['spells']) && is_array($raw['spells']) ? $raw['spells'] : [];
        $keep = [
            'id' => true,
            'label' => true,
            'mana' => true,
            'level' => true,
            'vocations' => true,
            'range' => true,
            'requiresTarget' => true,
            'selfTarget' => true,
            'allowOnSelf' => true,
            'kind' => true,
            'isMelee' => true,
            'cooldowns' => true,
            'customUISprite' => true,
        ];
        foreach ($list as $sp) {
            if (!is_array($sp) || !isset($sp['id']) || !is_string($sp['id']) || $sp['id'] === '') {
                continue;
            }
            $row = ['id' => $sp['id']];
            foreach ($keep as $k => $_) {
                if ($k === 'id') {
                    continue;
                }
                if (array_key_exists($k, $sp)) {
                    $row[$k] = $sp[$k];
                }
            }
            if (isset($sp['shape']) && is_array($sp['shape']) && isset($sp['shape']['type'])) {
                $row['shape'] = ['type' => $sp['shape']['type']];
            }
            if (!array_key_exists('selfTarget', $row)) {
                $kind = isset($sp['kind']) ? (string) $sp['kind'] : '';
                $req = !empty($sp['requiresTarget']);
                $hasShape = isset($sp['shape']) && is_array($sp['shape']) && isset($sp['shape']['type']);
                $field = !empty($sp['deploysField']) || !empty($sp['destroysField']);
                $chain = isset($sp['chain']);
                $range = isset($sp['range']) ? $sp['range'] : null;
                if (!$req && !$hasShape && !$field && !$chain
                    && ($kind === 'heal' || $kind === 'support' || ($range !== null && (int) $range <= 0))) {
                    $row['selfTarget'] = true;
                }
            }
            $out['spells'][] = $row;
        }
        return $out;
    }

    /**
     * Display/seed class list. MUST NOT include combat formulas.
     *
     * @param mixed $raw
     * @return array{classes: list<array{id: string, spells: list<string>}>}
     */
    public static function classesUi(mixed $raw): array
    {
        $out = ['classes' => []];
        $list = is_array($raw) && isset($raw['classes']) && is_array($raw['classes']) ? $raw['classes'] : [];
        foreach ($list as $row) {
            if (!is_array($row) || !isset($row['id']) || !is_string($row['id']) || $row['id'] === '') {
                continue;
            }
            $spells = [];
            if (isset($row['spells']) && is_array($row['spells'])) {
                foreach ($row['spells'] as $id) {
                    if (is_string($id) && $id !== '') {
                        $spells[] = $id;
                    }
                }
            }
            $out['classes'][] = ['id' => $row['id'], 'spells' => $spells];
        }
        return $out;
    }
}
