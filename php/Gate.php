<?php

declare(strict_types=1);

final class Gate
{
    private const WINDOW_MS = 60000;

    /** @var array<string, list<int>> */
    private static array $httpHits = [];

    /** @var array{httpRejected: int, connRejected: int} */
    public static array $metrics = ['httpRejected' => 0, 'connRejected' => 0];

    public static function nowMs(): int
    {
        return (int) floor(microtime(true) * 1000);
    }

    public static function allowHttp(string $ip, int $maxPerMin): bool
    {
        if ($maxPerMin <= 0) {
            return true;
        }
        $t = self::nowMs();
        $arr = [];
        foreach (self::$httpHits[$ip] ?? [] as $x) {
            if ($t - $x < self::WINDOW_MS) {
                $arr[] = $x;
            }
        }
        if (count($arr) >= $maxPerMin) {
            self::$httpHits[$ip] = $arr;
            self::$metrics['httpRejected'] += 1;
            return false;
        }
        $arr[] = $t;
        self::$httpHits[$ip] = $arr;
        return true;
    }
}
