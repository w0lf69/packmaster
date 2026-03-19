<?php
/**
 * PackMaster Standalone API Server Router
 *
 * Serves the PackMaster API outside Unraid's emhttpd auth wall.
 * Only Bearer token auth accepted — no CSRF, no browser sessions.
 *
 * Usage: php -S 0.0.0.0:9444 -t /usr/local/emhttp/plugins/packmaster router.php
 */

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Health check — no auth required
if ($uri === '/health') {
    header('Content-Type: application/json');
    echo json_encode(['status' => 'ok', 'service' => 'packmaster-api']);
    return true;
}

// API endpoint — route to api.php
if ($uri === '/api.php' || $uri === '/api' || $uri === '/') {
    // Enforce Bearer auth — standalone mode has no CSRF fallback
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/Bearer\s+\S+/', $auth)) {
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Bearer token required']);
        return true;
    }

    require __DIR__ . '/api.php';
    return true;
}

// Block everything else — don't expose SPA, helpers, config
http_response_code(404);
header('Content-Type: application/json');
echo json_encode(['error' => 'Not found']);
return true;
