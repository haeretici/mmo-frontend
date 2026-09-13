<?php

declare(strict_types=1);

final class ClientConfig
{
    /** @param array<string, mixed> $settings */
    public static function gameWsUrl(array $settings): string
    {
        if (isset($settings['gameWsUrl']) && is_string($settings['gameWsUrl']) && trim($settings['gameWsUrl']) !== '') {
            return trim($settings['gameWsUrl']);
        }
        $origin = (string) ($settings['gameOrigin'] ?? '');
        $parts = parse_url($origin);
        if (!is_array($parts) || empty($parts['host'])) {
            return '';
        }
        $scheme = ($parts['scheme'] ?? 'http') === 'https' ? 'wss' : 'ws';
        $port = isset($parts['port']) ? ':' . $parts['port'] : '';
        return $scheme . '://' . $parts['host'] . $port . '/v1/ws';
    }

    /**
     * @param array<string, mixed> $settings
     * @return array<string, mixed>
     */
    public static function public(array $settings): array
    {
        $limits = is_array($settings['limits'] ?? null) ? $settings['limits'] : [];
        $vocations = isset($settings['vocations']) && is_array($settings['vocations'])
            ? array_values($settings['vocations'])
            : [];
        $accountUrl = isset($settings['accountUrl']) && is_string($settings['accountUrl']) && $settings['accountUrl'] !== ''
            ? $settings['accountUrl']
            : '/account';
        $mapId = 'firstlight_isle';
        try {
            $root = Settings::resolveContentPath($settings);
            $mapId = Visual::defaultMapId($root);
        } catch (Throwable $e) {
            $mapId = 'firstlight_isle';
        }
        return [
            'apiBase' => ($settings['proxyApi'] ?? true) === false ? (string) ($settings['gameOrigin'] ?? '') : '',
            'wsUrl' => self::gameWsUrl($settings),
            'siteName' => (string) ($settings['siteName'] ?? 'Engine'),
            'vocations' => $vocations,
            'accountUrl' => $accountUrl,
            'mapId' => $mapId,
            'limits' => [
                'passwordMin' => (int) ($limits['passwordMin'] ?? 10) ?: 10,
                'passwordMax' => (int) ($limits['passwordMax'] ?? 128) ?: 128,
                'nameMin' => (int) ($limits['nameMin'] ?? 3) ?: 3,
                'nameMax' => (int) ($limits['nameMax'] ?? 20) ?: 20,
                'maxChars' => (int) ($limits['maxChars'] ?? 4) ?: 4,
            ],
        ];
    }

    /** @param array<string, mixed> $settings */
    public static function connectSrcExtra(array $settings): string
    {
        $ws = self::gameWsUrl($settings);
        $parts = parse_url($ws);
        if (!is_array($parts) || empty($parts['host'])) {
            return '';
        }
        $scheme = $parts['scheme'] ?? 'ws';
        $port = isset($parts['port']) ? ':' . $parts['port'] : '';
        return $scheme . '://' . $parts['host'] . $port;
    }

    /** @param array<string, mixed> $settings */
    public static function csp(array $settings): string
    {
        $ws = self::connectSrcExtra($settings);
        $connect = $ws !== '' ? "'self' {$ws}" : "'self'";
        return implode('; ', [
            "default-src 'none'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com",
            "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com data:",
            "connect-src {$connect}",
            "img-src 'self' data:",
            "base-uri 'none'",
            "form-action 'self'",
            "frame-ancestors 'none'",
        ]);
    }
}
