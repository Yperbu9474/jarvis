/**
 * Tool Guide — Static reference for the AI
 *
 * Explains all available tools and how to use them.
 * Update this file whenever tools are added or changed.
 *
 * When `hasSidecars` is false, sidecar-related content (target params,
 * list_sidecars, sidecar section) is omitted entirely so the AI
 * doesn't waste tokens thinking about remote execution.
 */

export function buildToolGuide(hasSidecars: boolean): string {
  const lines: string[] = [];

  lines.push('# Tool Guide');
  lines.push('');

  // --- Tools ---
  lines.push('## Tools');
  lines.push('');

  if (hasSidecars) {
    lines.push('These tools work locally by default. To run on a remote machine, pass the `target` parameter with a sidecar name or ID.');
    lines.push('');
  }

  lines.push('### run_command');
  lines.push('Execute a shell command. Returns stdout, stderr, and exit code.');
  lines.push('- `command` (required): The shell command to run');
  if (hasSidecars) lines.push('- `target`: Sidecar name or ID for remote execution');
  lines.push('- `cwd`: Working directory');
  lines.push('- `timeout`: Timeout in ms (default: 30000)');
  lines.push('');

  lines.push('### read_file');
  lines.push('Read a file\'s contents as text (max 100KB).');
  lines.push('- `path` (required): File path');
  if (hasSidecars) lines.push('- `target`: Sidecar name or ID for remote execution');
  lines.push('');

  lines.push('### write_file');
  lines.push('Write content to a file (creates or overwrites).');
  lines.push('- `path` (required): File path');
  lines.push('- `content` (required): Content to write');
  if (hasSidecars) lines.push('- `target`: Sidecar name or ID for remote execution');
  lines.push('');

  lines.push('### list_directory');
  lines.push('List directory contents with types and sizes.');
  lines.push('- `path` (required): Directory path');
  if (hasSidecars) lines.push('- `target`: Sidecar name or ID for remote execution');
  lines.push('');

  lines.push('### get_clipboard');
  lines.push('Read the clipboard contents.');
  if (hasSidecars) lines.push('- `target`: Sidecar name or ID for remote execution');
  lines.push('');

  lines.push('### set_clipboard');
  lines.push('Write text to the clipboard.');
  lines.push('- `content` (required): Text to write');
  if (hasSidecars) lines.push('- `target`: Sidecar name or ID for remote execution');
  lines.push('');

  lines.push('### capture_screen');
  lines.push('Take a screenshot of the screen. Returns base64-encoded PNG.');
  if (hasSidecars) lines.push('- `target`: Sidecar name or ID for remote execution');
  lines.push('');

  lines.push('### get_system_info');
  lines.push('Get system information (hostname, OS, architecture, CPU count).');
  if (hasSidecars) lines.push('- `target`: Sidecar name or ID for remote execution');
  lines.push('');

  // --- Browser ---
  lines.push('## Browser');
  lines.push('');
  lines.push('Control a Chrome browser for web research and interaction. Chrome auto-launches on first use. A persistent profile at ~/.jarvis/browser/profile retains login sessions.');
  lines.push('');
  lines.push('Workflow:');
  lines.push('1. `browser_navigate` to a URL — returns page text + interactive elements with [id] numbers');
  lines.push('2. `browser_click` / `browser_type` to interact using element [id]s');
  lines.push('3. `browser_snapshot` to see the page after an action');
  lines.push('4. `browser_scroll` to reveal content below the fold');
  lines.push('5. `browser_evaluate` for advanced JavaScript interactions');
  lines.push('6. `browser_screenshot` for visual capture');
  lines.push('');
  lines.push('Rules:');
  lines.push('- For READ-ONLY tasks, `browser_navigate` already returns content. Don\'t snapshot just to read.');
  lines.push('- For INTERACTIVE tasks, snapshot after each action to verify.');
  lines.push('- Fill forms FIRST, verify in snapshot, THEN submit.');
  lines.push('- If an element isn\'t visible, scroll down first.');
  lines.push('- Modern SPAs may need `browser_evaluate` for custom components.');
  lines.push('');

  // --- Sidecars ---
  if (hasSidecars) {
    lines.push('## Sidecars (Remote Machines)');
    lines.push('');
    lines.push('Sidecars are the user\'s other machines (laptops, servers, desktops) connected to the brain. They allow you to run commands, read/write files, and more on remote devices.');
    lines.push('');
    lines.push('### How to use sidecars');
    lines.push('1. Call `list_sidecars` to see which machines are available and their connection status');
    lines.push('2. Use any compatible tool with the `target` parameter set to the sidecar\'s name or ID');
    lines.push('3. If the sidecar is offline or doesn\'t support the required capability, you\'ll get a clear error');
    lines.push('');
    lines.push('### list_sidecars');
    lines.push('Query live sidecar status. Always call this before targeting a remote machine.');
    lines.push('- `filter`: Optional string to filter by name or ID (case-insensitive)');
    lines.push('- Returns: connection status, hostname, OS, capabilities, last seen time');
    lines.push('');
    lines.push('### Capabilities');
    lines.push('Each sidecar advertises what it can do:');
    lines.push('- `terminal` — supports `run_command`');
    lines.push('- `filesystem` — supports `read_file`, `write_file`, `list_directory`');
    lines.push('- `clipboard` — supports `get_clipboard`, `set_clipboard`');
    lines.push('- `screenshot` — supports `capture_screen`');
    lines.push('- `system_info` — supports `get_system_info`');
    lines.push('- `desktop`, `browser` — supports desktop/browser automation tools');
    lines.push('');
    lines.push('If a capability is listed as unavailable (with a reason), do NOT try to work around it with `run_command`. The required system tool is missing and shell commands will fail the same way.');
    lines.push('');
    lines.push('### Example workflow');
    lines.push('User: "Check disk space on my server"');
    lines.push('1. Call `list_sidecars` → see "home-server" is CONNECTED with terminal capability');
    lines.push('2. Call `run_command` with target="home-server", command="df -h"');
    lines.push('3. Report results to user');
    lines.push('');
  }

  // --- Desktop ---
  lines.push('## Desktop Automation (Windows)');
  lines.push('');
  lines.push('Control Windows desktop applications via the desktop-bridge sidecar (FlaUI). Works like browser tools but for native Windows apps.');
  lines.push('');
  lines.push('- `desktop_snapshot` — capture current window\'s UI elements');
  lines.push('- `desktop_click` / `desktop_type` — interact by element [id]');
  lines.push('- `desktop_open_app` — launch an application');
  lines.push('- `desktop_switch_window` — switch to a window by title');
  lines.push('- `desktop_list_windows` — list open windows');
  lines.push('- `desktop_screenshot` — visual capture');
  lines.push('- `desktop_scroll` — scroll within a window');
  lines.push('- `desktop_hotkey` — send keyboard shortcuts');
  lines.push('');

  // --- Task Management ---
  lines.push('## Task Management');
  lines.push('');
  lines.push('### manage_goals');
  lines.push('OKR-style goal management (create, list, score, decompose, morning plan, evening review).');
  lines.push('');
  lines.push('### manage_workflow');
  lines.push('Create and run automation workflows from natural language.');
  lines.push('');
  lines.push('### delegate_task');
  lines.push('Send a task to a specialist sub-agent (research analyst, software engineer, etc.). The specialist works independently and returns results.');
  lines.push('');
  lines.push('### manage_agents');
  lines.push('Manage persistent background agents for long-running tasks.');
  lines.push('');

  // --- Other ---
  lines.push('## Other Tools');
  lines.push('');
  lines.push('### research_queue');
  lines.push('Queue topics for background research during idle time.');
  lines.push('');
  lines.push('### commitments');
  lines.push('Track promises and tasks with due dates.');
  lines.push('');
  lines.push('### content_pipeline');
  lines.push('Manage content items through drafting stages.');

  return lines.join('\n');
}
