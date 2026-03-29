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
 * POST ?action=migrate&name=X — migrate stack from Dockge to PackMaster paths
 */

require_once __DIR__ . '/includes/helpers.php';

// ─── Auth: Bearer token OR Unraid CSRF ─────────────────────────────────
// Browser requests use Unraid's CSRF token (form-encoded POST).
// API requests from trusted machines use Bearer token (API_TOKEN in config).
$_PM_CFG = pm_get_config();
$_PM_API_AUTH = false;

$auth_header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
if (preg_match('/Bearer\s+(\S+)/', $auth_header, $m)) {
    $cfg_token = $_PM_CFG['API_TOKEN'] ?? '';
    if (!empty($cfg_token) && hash_equals($cfg_token, $m[1])) {
        $_PM_API_AUTH = true;
    } else {
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Invalid API token']);
        exit;
    }
}

// CSRF protection for non-Bearer POST requests (browser path).
// Validates Origin header matches the server to prevent cross-site request forgery.
if (!$_PM_API_AUTH && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $referer = $_SERVER['HTTP_REFERER'] ?? '';
    $server_host = $_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? '';

    // Extract host from Origin or Referer
    $request_host = '';
    if (!empty($origin)) {
        $request_host = parse_url($origin, PHP_URL_HOST) ?? '';
    } elseif (!empty($referer)) {
        $request_host = parse_url($referer, PHP_URL_HOST) ?? '';
    }

    // Strip port for comparison
    $server_base = preg_replace('/:\d+$/', '', $server_host);

    if (empty($request_host) || $request_host !== $server_base) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'CSRF validation failed']);
        exit;
    }
}

// POST body: form-encoded 'data' field (Unraid CSRF) or raw JSON (Bearer auth).
if ($_PM_API_AUTH) {
    $_RAW_BODY = file_get_contents('php://input') ?: '';
} else {
    $_RAW_BODY = $_POST['data'] ?? file_get_contents('php://input') ?: '';
}

// Debug log (gated by config)
if (($_PM_CFG['DEBUG_LOG'] ?? 'false') === 'true') {
    $log_line = date('H:i:s') . " {$_SERVER['REQUEST_METHOD']} action=" . ($_GET['action'] ?? 'none') . " auth=" . ($_PM_API_AUTH ? 'bearer' : 'csrf') . " body_len=" . strlen($_RAW_BODY) . "\n";
    file_put_contents('/tmp/packmaster-debug.log', $log_line, FILE_APPEND);
}

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
            'has_env'      => file_exists(pm_resolve_env_path($name, $stack['path'])),
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
        [$stdout, $stderr, $exit] = pm_compose_exec($stack['path'], $subcmd, $name);
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
        [$pull_out, , $pull_exit] = pm_compose_exec($stack['path'], 'pull', $name);
        if ($pull_exit !== 0) {
            echo json_encode(['success' => false, 'action' => 'update', 'phase' => 'pull', 'output' => $pull_out, 'exit' => $pull_exit]);
            break;
        }
        // Then up
        [$up_out, , $up_exit] = pm_compose_exec($stack['path'], 'up -d', $name);
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

        // Validate YAML via docker compose before writing
        $tmp = tempnam('/tmp', 'pm-compose-');
        file_put_contents($tmp, $content);
        $validate_cmd = sprintf(
            'docker compose -f %s config --quiet 2>/dev/null',
            escapeshellarg($tmp)
        );
        $validate_out = '';
        exec($validate_cmd, $validate_lines, $validate_exit);
        $validate_ok = $validate_exit === 0;
        if (!$validate_ok) {
            // Collect stderr for the error detail
            $stderr_cmd = sprintf('docker compose -f %s config --quiet 2>&1 1>/dev/null', escapeshellarg($tmp));
            $validate_out = trim(shell_exec($stderr_cmd) ?? '');
        }
        unlink($tmp);

        if (!$validate_ok) {
            http_response_code(422);
            echo json_encode(['error' => 'Invalid compose YAML', 'detail' => $validate_out]);
            break;
        }

        // Backup before save
        $backup = $compose_file . '.bak.' . date('Ymd_His');
        copy($compose_file, $backup);

        $bytes = file_put_contents($compose_file, $content);
        if ($bytes === false) {
            http_response_code(500);
            echo json_encode(['error' => "Write failed: $compose_file", 'success' => false]);
            break;
        }
        echo json_encode(['success' => true, 'backup' => basename($backup), 'bytes' => $bytes]);
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

            // Normalize path and restrict to /mnt/user/ — let Unraid handle FUSE/exclusive shares.
            // Do NOT use realpath(): it follows UnionFS mounts to physical disk paths (/mnt/cache/...)
            // which breaks the /mnt/user/ prefix check even for valid exclusive share paths.
            $path = rtrim(preg_replace('#/+#', '/', $path), '/');
            if (!str_starts_with($path, '/mnt/user/')) {
                $errors[] = "Path must be under /mnt/user/: $path";
                continue;
            }

            if (in_array($path, $registered_paths)) {
                $errors[] = "Already registered: $path";
                continue;
            }
            if (!is_dir($path)) { $errors[] = "Not found: $path"; continue; }
            if (!pm_find_compose_file($path)) { $errors[] = "No compose file: $path"; continue; }

            // Prevent name collisions — auto-suffix if needed
            $stackName = pm_unique_name($stackName, $registry);

            $registry['stacks'][] = ['name' => $stackName, 'path' => $path];
            $registered_paths[] = $path;
            $added[] = $stackName;
        }

        if (!pm_write_registry($registry)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Failed to write registry', 'added' => $added]);
            break;
        }
        $ok = count($added) > 0 || count($errors) === 0;
        echo json_encode(['success' => $ok, 'added' => $added, 'errors' => $errors, 'count' => count($added)]);
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
        if (!pm_write_registry($registry)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Failed to write registry']);
            break;
        }
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
        $env_file = pm_resolve_env_path($name, $stack['path']);
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
        if (!is_array($body)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid JSON body']);
            break;
        }
        $content = $body['content'] ?? null;
        if ($content === null || $content === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Empty content — refusing to save empty .env']);
            break;
        }

        // Resolve env path: prefer secrets dir, fall back to stack dir
        $env_file = pm_resolve_env_path($name, $stack['path']);
        // If file doesn't exist yet and secrets dir is configured, create in secrets dir
        if (!file_exists($env_file)) {
            $secrets_path = pm_secrets_dir_for_stack($name);
            if (!empty($secrets_path)) {
                if (!is_dir($secrets_path) && !mkdir($secrets_path, 0700, true)) {
                    http_response_code(500);
                    echo json_encode(['error' => "Failed to create secrets directory: $secrets_path"]);
                    break;
                }
                $env_file = $secrets_path . '/.env';
            }
        }

        // Backup before save (if file exists)
        $backup = '';
        if (file_exists($env_file)) {
            $backup = $env_file . '.bak.' . date('Ymd_His');
            copy($env_file, $backup);
        }

        $bytes = file_put_contents($env_file, $content);
        if ($bytes === false) {
            http_response_code(500);
            echo json_encode(['error' => "Write failed: $env_file", 'success' => false]);
            break;
        }
        echo json_encode(['success' => true, 'backup' => $backup ? basename($backup) : null, 'created' => !$backup, 'bytes' => $bytes]);
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
        // Registry checks hit remote registries — can take minutes for many stacks.
        set_time_limit(300);
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

    // ─── Stack Migration ──────────────────────────────────────────────

    case 'migrate':
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

        $cfg = pm_get_config();
        $stacks_dir = rtrim($cfg['SCAN_DIRS'] ?? '/mnt/user/packmaster/stacks', ',');
        // Use the first scan dir as the migration target
        $stacks_dir = trim(explode(',', $stacks_dir)[0]);
        $secrets_dir = $cfg['SECRETS_DIR'] ?? '/mnt/user/packmaster/secrets';

        $new_stack_dir = rtrim($stacks_dir, '/') . '/' . $name;
        $new_secrets_dir = rtrim($secrets_dir, '/') . '/' . $name;
        $old_path = $stack['path'];

        // Already migrated?
        if (realpath($old_path) === realpath($new_stack_dir)) {
            echo json_encode(['success' => true, 'action' => 'migrate', 'stack' => $name, 'skipped' => true, 'reason' => 'Already at target path']);
            break;
        }

        $steps = [];

        // 1. Copy entire stack directory (compose, Dockerfiles, configs, etc.)
        $compose_file = pm_find_compose_file($old_path);
        if (!$compose_file) {
            http_response_code(400);
            echo json_encode(['error' => "No compose file found in $old_path"]);
            break;
        }

        if (!is_dir($new_stack_dir)) {
            mkdir($new_stack_dir, 0755, true);
        }

        // Copy all files except .env (that goes to secrets dir)
        $copied_files = [];
        foreach (scandir($old_path) as $entry) {
            if ($entry === '.' || $entry === '..') continue;
            $src = rtrim($old_path, '/') . '/' . $entry;
            $dst = $new_stack_dir . '/' . $entry;
            if ($entry === '.env') continue; // handled separately
            if (is_dir($src)) {
                // Recursively copy subdirectories (build contexts, etc.)
                exec(sprintf('cp -a %s %s', escapeshellarg($src), escapeshellarg($dst)));
                $copied_files[] = $entry . '/';
            } else {
                copy($src, $dst);
                $copied_files[] = $entry;
            }
        }
        $steps[] = 'copied ' . count($copied_files) . ' items: ' . implode(', ', $copied_files);

        // 2. Copy .env to secrets dir if it exists
        $old_env = rtrim($old_path, '/') . '/.env';
        $existing_secrets_env = rtrim($secrets_dir, '/') . '/' . $name . '/.env';
        $env_migrated = false;

        if (file_exists($existing_secrets_env)) {
            $steps[] = '.env already in secrets dir';
            $env_migrated = true;
        } elseif (file_exists($old_env)) {
            if (!is_dir($new_secrets_dir)) {
                mkdir($new_secrets_dir, 0700, true);
            }
            copy($old_env, $new_secrets_dir . '/.env');
            $steps[] = '.env copied to ' . $new_secrets_dir . '/.env';
            $env_migrated = true;
        } else {
            $steps[] = 'no .env to migrate';
        }

        // 3. Down from old path
        [$down_out, , $down_exit] = pm_compose_exec($old_path, 'down', $name);
        if ($down_exit !== 0) {
            echo json_encode([
                'success' => false, 'action' => 'migrate', 'stack' => $name,
                'phase' => 'down', 'output' => $down_out, 'steps' => $steps,
            ]);
            break;
        }
        $steps[] = 'down from old path (exit 0)';

        // 4. Up from new path
        [$up_out, , $up_exit] = pm_compose_exec($new_stack_dir, 'up -d', $name);
        if ($up_exit !== 0) {
            // Rollback: bring old path back up
            pm_compose_exec($old_path, 'up -d', $name);
            echo json_encode([
                'success' => false, 'action' => 'migrate', 'stack' => $name,
                'phase' => 'up', 'output' => $up_out, 'steps' => $steps,
                'rollback' => 'old path brought back up',
            ]);
            break;
        }
        $steps[] = 'up from new path (exit 0)';

        // 5. Update registry
        foreach ($registry['stacks'] as &$s) {
            if ($s['name'] === $name) {
                $s['path'] = $new_stack_dir;
                break;
            }
        }
        unset($s);
        if (!pm_write_registry($registry)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'action' => 'migrate', 'stack' => $name, 'error' => 'Failed to write registry', 'steps' => $steps]);
            break;
        }
        $steps[] = 'registry updated to ' . $new_stack_dir;

        echo json_encode([
            'success'   => true,
            'action'    => 'migrate',
            'stack'     => $name,
            'old_path'  => $old_path,
            'new_path'  => $new_stack_dir,
            'env_migrated' => $env_migrated,
            'steps'     => $steps,
            'output'    => $down_out . "\n" . $up_out,
        ]);
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => "Unknown action: $action"]);
        break;
}
