<?php

declare(strict_types=1);

define('APP_ROOT', dirname(__DIR__));
define('APP_PHP', APP_ROOT . '/php');
define('APP_STATIC', APP_ROOT . '/static');

require_once APP_ROOT . '/../content/php/Pack.php';
require_once APP_PHP . '/Settings.php';
require_once APP_PHP . '/Http.php';
require_once APP_PHP . '/Gate.php';
require_once APP_PHP . '/ClientConfig.php';
require_once APP_PHP . '/Proxy.php';
require_once APP_PHP . '/Visual.php';
require_once APP_PHP . '/Router.php';
