<?php
/**
 * PackMaster API — Docker Compose management endpoints.
 * Called via AJAX from the React SPA.
 *
 * GET  ?action=stacks       — list all registered stacks with status
 * GET  ?action=stack&name=X — single stack detail
 * POST ?action=up&name=X    — docker compose up -d
 * POST ?action=down&name=X  — docker compose down
 * POST ?action=restart&name=X — docker compose restart
 * POST ?action=pull&name=X  — docker compose pull
 * POST ?action=update&name=X — pull + up -d
 * GET  ?action=logs&name=X  — SSE log stream
 * GET  ?action=compose&name=X — read compose.yaml
 * POST ?action=save&name=X  — write compose.yaml
 * POST ?action=register     — add stack to registry
 * POST ?action=unregister   — remove stack from registry
 * GET  ?action=discover     — scan directories for compose files
 * GET  ?action=registries   — show configured Docker registries
 */

require_once __DIR__ . '/includes/helpers.php';

// POST body comes from form-encoded 'data' field (Unraid CSRF requires form-encoded POST).
// Fallback to php://input for CLI testing.
$_RAW_BODY = $_POST['data'] ?? file_get_contents('php://input') ?: '';

// Debug log
$log_line = date('H:i:s') . " {$_SERVER['REQUEST_METHOD']} action=" . ($_GET['action'] ?? 'none') . " body_len=" . strlen($_RAW_BODY) . " body=" . substr($_RAW_BODY, 0, 200) . "\n";
file_put_contents('/tmp/packmaster-debug.log', $log_line, FILE_APPEND);

header('Content-Type: application/json');

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$name = $_GET['name'] ?? $_POST['name'] ?? '';
$registry = pm_read_registry();

switch ($action) {

    case 'stacks':
        $result = [];
        foreach ($registry['stacks'] as $stack) {
            $containers = pm_stack_status($stack['path']);
            $running = 0;
            $total = count($containers);
            foreach ($containers as $c) {
                if (stripos($c['State'] ?? '', 'running') !== false) $running++;
            }
            $result[] = [
                'name'       => $stack['name'],
                'path'       => $stack['path'],
                'running'    => $running,
                'total'      => $total,
                'status'     => $total === 0 ? 'stopped' : ($running === $total ? 'running' : ($running > 0 ? 'partial' : 'stopped')),
                'containers' => $containers,
            ];
        }
        echo json_encode(['stacks' => $result, 'scan_dirs' => $registry['scan_dirs'] ?? []]);
        break;

    case 'stack':
        $stack = pm_validate_stack($name, $registry);
        if (!$stack) {
            http_response_code(404);
            echo json_encode(['error' => "Stack '$name' not found"]);
            break;
        }
        $containers = pm_stack_status($stack['path']);
        $compose_file = pm_find_compose_file($stack['path']);
        echo json_encode([
            'name'         => $stack['name'],
            'path'         => $stack['path'],
            'compose_file' => $compose_file,
            'has_env'      => file_exists($stack['path'] . '/.env'),
            'containers'   => $containers,
        ]);
        break;

    case 'up':
    case 'down':
    case 'restart':
    case 'pull':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'POST required']);
            break;
        }
        $stack = pm_validate_stack($name, $registry);
        if (!$stack) {
            http_response_code(404);
            echo json_encode(['error' => "Stack '$name' not found"]);
            break;
        }
        $subcmd = match($action) {
            'up'      => 'up -d',
            'down'    => 'down',
            'restart' => 'restart',
            'pull'    => 'pull',
        };
        [$stdout, $stderr, $exit] = pm_compose_exec($stack['path'], $subcmd);
        echo json_encode([
            'success' => $exit === 0,
            'action'  => $action,
            'stack'   => $name,
            'output'  => $stdout,
            'exit'    => $exit,
        ]);
        break;

    case 'update':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'POST required']);
            break;
        }
        $stack = pm_validate_stack($name, $registry);
        if (!$stack) {
            http_response_code(404);
            echo json_encode(['error' => "Stack '$name' not found"]);
            break;
        }
        // Pull first
        [$pull_out, , $pull_exit] = pm_compose_exec($stack['path'], 'pull');
        if ($pull_exit !== 0) {
            echo json_encode(['success' => false, 'action' => 'update', 'phase' => 'pull', 'output' => $pull_out, 'exit' => $pull_exit]);
            break;
        }
        // Then up
        [$up_out, , $up_exit] = pm_compose_exec($stack['path'], 'up -d');
        echo json_encode([
            'success' => $up_exit === 0,
            'action'  => 'update',
            'stack'   => $name,
            'output'  => $pull_out . "\n" . $up_out,
            'exit'    => $up_exit,
        ]);
        break;

    case 'logs':
        $stack = pm_validate_stack($name, $registry);
        if (!$stack) {
            http_response_code(404);
            echo json_encode(['error' => "Stack '$name' not found"]);
            exit;
        }
        $compose_file = pm_find_compose_file($stack['path']);
        if (!$compose_file) {
            http_response_code(404);
            echo json_encode(['error' => 'No compose file found']);
            exit;
        }

        // SSE stream
        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache');
        header('Connection: keep-alive');
        header('X-Accel-Buffering: no');

        $container = $_GET['container'] ?? '';
        $tail = (int)($_GET['tail'] ?? 100);
        $tail = max(10, min($tail, 1000));

        $cmd = sprintf(
            'docker compose -f %s logs -f --tail=%d %s 2>&1',
            escapeshellarg($compose_file),
            $tail,
            $container ? escapeshellarg($container) : ''
        );

        $proc = popen($cmd, 'r');
        if (!$proc) {
            echo "data: {\"error\":\"Failed to start log stream\"}\n\n";
            exit;
        }

        // Disable output buffering
        if (ob_get_level()) ob_end_flush();

        while (!feof($proc)) {
            $line = fgets($proc);
            if ($line !== false) {
                $line = rtrim($line, "\n\r");
                echo "data: " . json_encode(['line' => $line]) . "\n\n";
                flush();
            }
            if (connection_aborted()) break;
        }
        pclose($proc);
        exit;

    case 'compose':
        $stack = pm_validate_stack($name, $registry);
        if (!$stack) {
            http_response_code(404);
            echo json_encode(['error' => "Stack '$name' not found"]);
            break;
        }
        $compose_file = pm_find_compose_file($stack['path']);
        if (!$compose_file) {
            http_response_code(404);
            echo json_encode(['error' => 'No compose file found']);
            break;
        }
        echo json_encode([
            'name'    => $stack['name'],
            'file'    => basename($compose_file),
            'content' => file_get_contents($compose_file),
        ]);
        break;

    case 'save':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'POST required']);
            break;
        }
        $stack = pm_validate_stack($name, $registry);
        if (!$stack) {
            http_response_code(404);
            echo json_encode(['error' => "Stack '$name' not found"]);
            break;
        }
        $compose_file = pm_find_compose_file($stack['path']);
        if (!$compose_file) {
            http_response_code(404);
            echo json_encode(['error' => 'No compose file found']);
            break;
        }

        $body = json_decode($_RAW_BODY, true);
        $content = $body['content'] ?? '';
        if (empty($content)) {
            http_response_code(400);
            echo json_encode(['error' => 'Empty content']);
            break;
        }

        // Backup before save
        $backup = $compose_file . '.bak.' . date('Ymd_His');
        copy($compose_file, $backup);

        file_put_contents($compose_file, $content);
        echo json_encode(['success' => true, 'backup' => basename($backup)]);
        break;

    case 'register':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'POST required']);
            break;
        }
        $body = json_decode($_RAW_BODY, true);

        // Support bulk register: { "stacks": [{ "path": "...", "name": "..." }, ...] }
        $items = isset($body['stacks']) ? $body['stacks'] : [['path' => $body['path'] ?? '', 'name' => $body['name'] ?? '']];

        $registered_paths = array_column($registry['stacks'], 'path');
        $added = [];
        $errors = [];

        foreach ($items as $item) {
            $path = $item['path'] ?? '';
            $stackName = $item['name'] ?? basename($path);

            if (!is_dir($path)) { $errors[] = "Not found: $path"; continue; }
            if (!pm_find_compose_file($path)) { $errors[] = "No compose file: $path"; continue; }
            if (in_array($path, $registered_paths)) { continue; } // skip dupes silently

            $registry['stacks'][] = ['name' => $stackName, 'path' => $path];
            $registered_paths[] = $path;
            $added[] = $stackName;
        }

        pm_write_registry($registry);
        echo json_encode(['success' => true, 'added' => $added, 'errors' => $errors, 'count' => count($added)]);
        break;

    case 'unregister':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'POST required']);
            break;
        }
        $registry['stacks'] = array_values(array_filter(
            $registry['stacks'],
            fn($s) => $s['name'] !== $name
        ));
        pm_write_registry($registry);
        echo json_encode(['success' => true]);
        break;

    case 'discover':
        $cfg = pm_get_config();
        $scan_dirs = array_filter(array_map('trim', explode(',', $cfg['SCAN_DIRS'] ?? '')));
        // Also check registry scan_dirs
        foreach ($registry['scan_dirs'] ?? [] as $dir) {
            if (!in_array($dir, $scan_dirs)) $scan_dirs[] = $dir;
        }

        $found = [];
        $registered_paths = array_column($registry['stacks'], 'path');

        foreach ($scan_dirs as $scan_dir) {
            if (!is_dir($scan_dir)) continue;
            foreach (scandir($scan_dir) as $entry) {
                if ($entry === '.' || $entry === '..') continue;
                $full = rtrim($scan_dir, '/') . '/' . $entry;
                if (!is_dir($full)) continue;
                if (!pm_find_compose_file($full)) continue;
                $found[] = [
                    'name'       => $entry,
                    'path'       => $full,
                    'registered' => in_array($full, $registered_paths),
                ];
            }
        }
        echo json_encode(['stacks' => $found, 'scan_dirs' => $scan_dirs]);
        break;

    case 'registries':
        $config_path = '/root/.docker/config.json';
        if (!file_exists($config_path)) {
            echo json_encode(['configured' => false, 'registries' => []]);
            break;
        }
        $config = json_decode(file_get_contents($config_path), true);
        $auths = $config['auths'] ?? [];
        $registries = [];
        foreach ($auths as $host => $auth) {
            $registries[] = [
                'host'          => $host,
                'has_auth'      => !empty($auth['auth'] ?? ''),
            ];
        }
        echo json_encode(['configured' => true, 'registries' => $registries]);
        break;

    // ─── .env file management ──────────────────────────────────────────

    case 'env':
        $stack = pm_validate_stack($name, $registry);
        if (!$stack) {
            http_response_code(404);
            echo json_encode(['error' => "Stack '$name' not found"]);
            break;
        }
        $env_file = $stack['path'] . '/.env';
        echo json_encode([
            'name'    => $stack['name'],
            'exists'  => file_exists($env_file),
            'content' => file_exists($env_file) ? file_get_contents($env_file) : '',
        ]);
        break;

    case 'save_env':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'POST required']);
            break;
        }
        $stack = pm_validate_stack($name, $registry);
        if (!$stack) {
            http_response_code(404);
            echo json_encode(['error' => "Stack '$name' not found"]);
            break;
        }

        $body = json_decode($_RAW_BODY, true);
        $content = $body['content'] ?? '';

        $env_file = $stack['path'] . '/.env';

        // Backup before save (if file exists)
        $backup = '';
        if (file_exists($env_file)) {
            $backup = $env_file . '.bak.' . date('Ymd_His');
            copy($env_file, $backup);
        }

        file_put_contents($env_file, $content);
        echo json_encode(['success' => true, 'backup' => $backup ? basename($backup) : null, 'created' => !$backup]);
        break;

    // ─── Watchtower Integration ────────────────────────────────────────

    case 'watchtower_status':
        echo json_encode(pm_detect_watchtower());
        break;

    case 'image_updates':
        if ($name) {
            // Check a specific stack (hits registry — takes a few seconds per image)
            $stack = pm_validate_stack($name, $registry);
            if (!$stack) {
                http_response_code(404);
                echo json_encode(['error' => "Stack '$name' not found"]);
                break;
            }
            echo json_encode(pm_check_stack_updates($name, $stack['path']));
        } else {
            // Return cached results for all stacks (fast — reads /tmp)
            echo json_encode(['stacks' => pm_read_update_cache()]);
        }
        break;

    case 'check_all_updates':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'POST required']);
            break;
        }
        // Check every registered stack. Can take 30-60s for many stacks.
        // Streams progress as JSON at the end (not SSE — simpler).
        $results = [];
        $totalUpdates = 0;
        foreach ($registry['stacks'] as $stack) {
            $r = pm_check_stack_updates($stack['name'], $stack['path']);
            $results[$stack['name']] = $r;
            if ($r['has_updates']) $totalUpdates++;
        }
        echo json_encode([
            'stacks'        => $results,
            'checked_at'    => date('c'),
            'total_updates' => $totalUpdates,
        ]);
        break;

    case 'watchtower_check':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'POST required']);
            break;
        }
        $wt = pm_detect_watchtower();
        if (!$wt['detected'] || !$wt['running']) {
            echo json_encode(['success' => false, 'error' => 'Watchtower not detected or not running']);
            break;
        }
        if (!$wt['http_api']) {
            echo json_encode([
                'success' => false,
                'error'   => 'Watchtower HTTP API not enabled',
                'hint'    => 'Add WATCHTOWER_HTTP_API_UPDATE=true and WATCHTOWER_HTTP_API_TOKEN=<your-token> to your Watchtower compose environment.',
            ]);
            break;
        }
        // Read API token from PackMaster config or Watchtower container
        $cfg = pm_get_config();
        $token = $cfg['WATCHTOWER_TOKEN'] ?? '';
        if (empty($token)) {
            // Try to read from Watchtower's own env (inspected in detect)
            $containerName = $wt['container_name'];
            $tokenCmd = sprintf(
                "docker inspect %s --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep WATCHTOWER_HTTP_API_TOKEN | cut -d= -f2",
                escapeshellarg($containerName)
            );
            $token = trim(shell_exec($tokenCmd) ?? '');
        }
        if (empty($token)) {
            echo json_encode(['success' => false, 'error' => 'No API token found. Set WATCHTOWER_TOKEN in PackMaster settings or WATCHTOWER_HTTP_API_TOKEN in Watchtower config.']);
            break;
        }
        echo json_encode(pm_watchtower_api_trigger($wt['container_ip'], $token));
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => "Unknown action: $action"]);
        break;
}
