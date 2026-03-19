<?php
/**
 * PackMaster — Docker Compose helpers
 * Thin wrappers around shell_exec for docker compose commands.
 */

define('REGISTRY_FILE', '/boot/config/plugins/packmaster/registry.json');
define('CONFIG_FILE', '/boot/config/plugins/packmaster/packmaster.cfg');
define('DEFAULT_CONFIG', '/usr/local/emhttp/plugins/packmaster/default.cfg');
define('UPDATE_CACHE_FILE', '/tmp/packmaster-updates.json');

/**
 * Read the stack registry from flash.
 */
function pm_read_registry(): array {
    if (!file_exists(REGISTRY_FILE)) {
        return ['stacks' => [], 'scan_dirs' => ['/mnt/user/appdata/dockge/stacks']];
    }
    $data = json_decode(file_get_contents(REGISTRY_FILE), true);
    return is_array($data) ? $data : ['stacks' => [], 'scan_dirs' => []];
}

/**
 * Write the stack registry to flash.
 */
function pm_write_registry(array $registry): void {
    $dir = dirname(REGISTRY_FILE);
    if (!is_dir($dir)) mkdir($dir, 0700, true);
    file_put_contents(REGISTRY_FILE, json_encode($registry, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

/**
 * Generate a unique stack name (auto-suffix -2, -3, etc. on collision).
 */
function pm_unique_name(string $name, array $registry): string {
    $existing = array_column($registry['stacks'], 'name');
    if (!in_array($name, $existing)) return $name;
    $i = 2;
    while (in_array("$name-$i", $existing)) $i++;
    return "$name-$i";
}

/**
 * Find the compose file in a stack directory.
 * Returns the full path or null.
 */
function pm_find_compose_file(string $dir): ?string {
    foreach (['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml'] as $name) {
        $path = rtrim($dir, '/') . '/' . $name;
        if (file_exists($path)) return $path;
    }
    return null;
}

/**
 * Get stack status via docker compose ps.
 * Returns parsed container info array.
 */
function pm_stack_status(string $stack_dir): array {
    $compose_file = pm_find_compose_file($stack_dir);
    if (!$compose_file) return [];

    $cmd = sprintf(
        'docker compose -f %s ps --format json 2>/dev/null',
        escapeshellarg($compose_file)
    );
    $output = shell_exec($cmd);
    if (!$output) return [];

    // docker compose ps --format json outputs one JSON object per line
    $containers = [];
    foreach (explode("\n", trim($output)) as $line) {
        $line = trim($line);
        if ($line === '') continue;
        $parsed = json_decode($line, true);
        if (is_array($parsed)) {
            $containers[] = $parsed;
        }
    }
    return $containers;
}

/**
 * Resolve the .env file path for a stack.
 * Checks secrets dir first (SECRETS_DIR/<stack_name>/.env), falls back to stack dir.
 */
function pm_resolve_env_path(string $stack_name, string $stack_dir): string {
    $cfg = pm_get_config();
    $secrets_dir = $cfg['SECRETS_DIR'] ?? '';
    if (!empty($secrets_dir)) {
        $secrets_env = rtrim($secrets_dir, '/') . '/' . $stack_name . '/.env';
        if (file_exists($secrets_env)) return $secrets_env;
    }
    return rtrim($stack_dir, '/') . '/.env';
}

/**
 * Get the secrets directory path for a stack (for creating new .env files).
 * Returns the secrets dir path if configured, otherwise the stack dir.
 */
function pm_secrets_dir_for_stack(string $stack_name): string {
    $cfg = pm_get_config();
    $secrets_dir = $cfg['SECRETS_DIR'] ?? '';
    if (!empty($secrets_dir)) {
        return rtrim($secrets_dir, '/') . '/' . $stack_name;
    }
    return '';
}

/**
 * Run a docker compose command on a stack.
 * Automatically passes --env-file if secrets dir has a .env for this stack.
 * Returns [stdout, stderr, exit_code].
 */
function pm_compose_exec(string $stack_dir, string $subcommand, string $stack_name = ''): array {
    // Allowlist: only permit known docker compose subcommands
    $allowed = ['up', 'down', 'restart', 'pull', 'config', 'ps', 'logs'];
    $parts = preg_split('/\s+/', trim($subcommand), 2);
    if (!in_array($parts[0], $allowed, true)) {
        return ['', 'Blocked compose subcommand: ' . $parts[0], 1];
    }

    $compose_file = pm_find_compose_file($stack_dir);
    if (!$compose_file) {
        return ['', 'No compose file found in ' . $stack_dir, 1];
    }

    // Check for .env in secrets dir
    $env_file_flag = '';
    if (!empty($stack_name)) {
        $env_path = pm_resolve_env_path($stack_name, $stack_dir);
        if (file_exists($env_path) && $env_path !== rtrim($stack_dir, '/') . '/.env') {
            $env_file_flag = sprintf('--env-file %s', escapeshellarg($env_path));
        }
    }

    $cmd = sprintf(
        'cd %s && docker compose -f %s %s %s 2>&1',
        escapeshellarg(dirname($compose_file)),
        escapeshellarg(basename($compose_file)),
        $env_file_flag,
        $subcommand
    );

    $output = [];
    $exit_code = 0;
    exec($cmd, $output, $exit_code);
    return [implode("\n", $output), '', $exit_code];
}

/**
 * Validate that a stack path exists and has a compose file.
 */
function pm_validate_stack(string $name, array $registry): ?array {
    foreach ($registry['stacks'] as $stack) {
        if ($stack['name'] === $name) {
            if (!is_dir($stack['path'])) return null;
            if (!pm_find_compose_file($stack['path'])) return null;
            return $stack;
        }
    }
    return null;
}

/**
 * Get plugin config (merged defaults + user overrides).
 */
function pm_get_config(): array {
    $cfg = [];
    if (file_exists(DEFAULT_CONFIG)) {
        $cfg = parse_ini_file(DEFAULT_CONFIG) ?: [];
    }
    if (file_exists(CONFIG_FILE)) {
        $user_cfg = parse_ini_file(CONFIG_FILE) ?: [];
        $cfg = array_merge($cfg, $user_cfg);
    }
    return $cfg;
}

// ─── Watchtower Integration ────────────────────────────────────────────

/**
 * Detect Watchtower container by its self-label.
 * Returns config: schedule, flags, HTTP API status, container IP.
 */
function pm_detect_watchtower(): array {
    // Find by the label Watchtower sets on itself
    $cmd = 'docker ps -a --filter "label=com.centurylinklabs.watchtower" --format json 2>/dev/null';
    $output = shell_exec($cmd);
    if (!$output) {
        return ['detected' => false];
    }

    // Take the first match
    $line = explode("\n", trim($output))[0];
    $container = json_decode($line, true);
    if (!is_array($container)) {
        return ['detected' => false];
    }

    $containerName = $container['Names'] ?? 'watchtower';

    // Full inspect for env vars and networking
    $inspectCmd = sprintf('docker inspect %s --format json 2>/dev/null', escapeshellarg($containerName));
    $inspectOutput = shell_exec($inspectCmd);
    if (!$inspectOutput) {
        return ['detected' => true, 'running' => false, 'container_name' => $containerName];
    }

    $inspectData = json_decode($inspectOutput, true);
    $info = is_array($inspectData[0] ?? null) ? $inspectData[0] : ($inspectData ?? []);

    // Parse env vars into a map
    $envMap = [];
    foreach ($info['Config']['Env'] ?? [] as $e) {
        $parts = explode('=', $e, 2);
        $envMap[$parts[0]] = $parts[1] ?? '';
    }

    // Get container IP (try all networks)
    $containerIp = '';
    foreach ($info['NetworkSettings']['Networks'] ?? [] as $net) {
        if (!empty($net['IPAddress'])) {
            $containerIp = $net['IPAddress'];
            break;
        }
    }

    $httpApiEnabled = ($envMap['WATCHTOWER_HTTP_API_UPDATE'] ?? '') === 'true';

    return [
        'detected'        => true,
        'running'         => ($info['State']['Status'] ?? '') === 'running',
        'container_name'  => ltrim($info['Name'] ?? '/' . $containerName, '/'),
        'image'           => $info['Config']['Image'] ?? '',
        'schedule'        => $envMap['WATCHTOWER_SCHEDULE'] ?? null,
        'monitor_only'    => ($envMap['WATCHTOWER_MONITOR_ONLY'] ?? 'false') === 'true',
        'cleanup'         => ($envMap['WATCHTOWER_CLEANUP'] ?? 'false') === 'true',
        'rolling_restart' => ($envMap['WATCHTOWER_ROLLING_RESTART'] ?? 'false') === 'true',
        'http_api'        => $httpApiEnabled,
        'api_token_set'   => !empty($envMap['WATCHTOWER_HTTP_API_TOKEN'] ?? ''),
        'container_ip'    => $containerIp,
    ];
}

/**
 * Check if a single Docker image has a newer version available remotely.
 * Compares local RepoDigest with remote index digest via buildx imagetools.
 */
function pm_check_image_update(string $image): array {
    // Get local digest
    $localCmd = sprintf(
        "docker image inspect %s --format '{{index .RepoDigests 0}}' 2>/dev/null",
        escapeshellarg($image)
    );
    $localDigest = trim(shell_exec($localCmd) ?? '');

    if (empty($localDigest)) {
        return ['image' => $image, 'status' => 'unknown', 'reason' => 'no_local_digest'];
    }

    if (!preg_match('/sha256:([a-f0-9]+)/', $localDigest, $localMatch)) {
        return ['image' => $image, 'status' => 'unknown', 'reason' => 'unparseable_local'];
    }

    // Get remote digest via buildx imagetools (hits registry, respects /root/.docker/config.json auth)
    $remoteCmd = sprintf(
        "docker buildx imagetools inspect %s 2>&1 | grep '^Digest:' | head -1",
        escapeshellarg($image)
    );
    $remoteLine = trim(shell_exec($remoteCmd) ?? '');

    if (!preg_match('/sha256:([a-f0-9]+)/', $remoteLine, $remoteMatch)) {
        return ['image' => $image, 'status' => 'unknown', 'reason' => 'no_remote_digest'];
    }

    $match = $localMatch[1] === $remoteMatch[1];

    return [
        'image'         => $image,
        'status'        => $match ? 'up_to_date' : 'update_available',
        'local_digest'  => substr($localMatch[1], 0, 12),
        'remote_digest' => substr($remoteMatch[1], 0, 12),
    ];
}

/**
 * Read the update check cache from /tmp.
 */
function pm_read_update_cache(): array {
    if (!file_exists(UPDATE_CACHE_FILE)) return [];
    $data = json_decode(file_get_contents(UPDATE_CACHE_FILE), true);
    return is_array($data) ? $data : [];
}

/**
 * Write update check results to /tmp cache.
 */
function pm_write_update_cache(array $cache): void {
    file_put_contents(UPDATE_CACHE_FILE, json_encode($cache, JSON_PRETTY_PRINT));
}

/**
 * Check all images in a stack for remote updates.
 * Results are cached per-stack in /tmp.
 */
function pm_check_stack_updates(string $stackName, string $stackPath): array {
    $containers = pm_stack_status($stackPath);
    if (empty($containers)) {
        return ['stack' => $stackName, 'updates' => [], 'checked_at' => date('c'), 'has_updates' => false];
    }

    $updates = [];
    $seen = [];
    foreach ($containers as $c) {
        $image = $c['Image'] ?? '';
        if (empty($image) || isset($seen[$image])) continue;
        $seen[$image] = true;
        $check = pm_check_image_update($image);
        $check['service'] = $c['Service'] ?? $c['Name'] ?? '';
        $updates[] = $check;
    }

    $result = [
        'stack'       => $stackName,
        'updates'     => $updates,
        'checked_at'  => date('c'),
        'has_updates' => count(array_filter($updates, fn($u) => $u['status'] === 'update_available')) > 0,
    ];

    // Cache
    $cache = pm_read_update_cache();
    $cache[$stackName] = $result;
    pm_write_update_cache($cache);

    return $result;
}

/**
 * Call Watchtower HTTP API to trigger an update check.
 * PHP runs on the host; uses container IP since port may not be mapped.
 */
function pm_watchtower_api_trigger(string $containerIp, string $token): array {
    if (empty($containerIp)) {
        return ['success' => false, 'error' => 'No container IP'];
    }

    $url = "http://{$containerIp}:8080/v1/update";
    $cmd = sprintf(
        'curl -s -m 15 -X POST -H %s %s 2>&1',
        escapeshellarg("Authorization: Bearer {$token}"),
        escapeshellarg($url)
    );

    $output = trim(shell_exec($cmd) ?? '');

    // Watchtower returns 200 with empty body on success
    $isError = str_contains($output, 'curl:') || str_contains($output, 'Connection refused');

    return [
        'success'  => !$isError,
        'response' => $output ?: '(empty — update triggered)',
    ];
}
