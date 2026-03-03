<?php
/**
 * PackMaster — Docker Compose helpers
 * Thin wrappers around shell_exec for docker compose commands.
 */

define('REGISTRY_FILE', '/boot/config/plugins/packmaster/registry.json');
define('CONFIG_FILE', '/boot/config/plugins/packmaster/packmaster.cfg');
define('DEFAULT_CONFIG', '/usr/local/emhttp/plugins/packmaster/default.cfg');

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
    file_put_contents(REGISTRY_FILE, json_encode($registry, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
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
 * Run a docker compose command on a stack.
 * Returns [stdout, stderr, exit_code].
 */
function pm_compose_exec(string $stack_dir, string $subcommand): array {
    $compose_file = pm_find_compose_file($stack_dir);
    if (!$compose_file) {
        return ['', 'No compose file found in ' . $stack_dir, 1];
    }

    $cmd = sprintf(
        'cd %s && docker compose -f %s %s 2>&1',
        escapeshellarg(dirname($compose_file)),
        escapeshellarg(basename($compose_file)),
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
