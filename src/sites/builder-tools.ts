/**
 * Site Builder — LLM Tools
 *
 * Tools available to the LLM when working in the context of a site builder project.
 * These are scoped to the active project directory.
 */

import type { ToolDefinition } from '../actions/tools/registry.ts';
import type { ProjectManager } from './project-manager.ts';
import type { GitManager } from './git-manager.ts';

export function createSiteBuilderTools(
  projectManager: ProjectManager,
  gitManager: GitManager,
): ToolDefinition[] {
  return [
    {
      name: 'site_read_file',
      description: 'Read a file from the current site builder project. Returns the file content as text.',
      category: 'site-builder',
      parameters: {
        project_id: { type: 'string', description: 'The project ID', required: true },
        path: { type: 'string', description: 'Relative path to the file (e.g., "src/App.tsx")', required: true },
      },
      execute: async (params) => {
        try {
          const content = await projectManager.readFile(params.project_id as string, params.path as string);
          return content;
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
    {
      name: 'site_write_file',
      description: 'Write content to a file in the current site builder project. Creates parent directories if needed.',
      category: 'site-builder',
      parameters: {
        project_id: { type: 'string', description: 'The project ID', required: true },
        path: { type: 'string', description: 'Relative path to the file (e.g., "src/App.tsx")', required: true },
        content: { type: 'string', description: 'The full file content to write', required: true },
      },
      execute: async (params) => {
        try {
          await projectManager.writeFile(params.project_id as string, params.path as string, params.content as string);
          return `File written: ${params.path}`;
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
    {
      name: 'site_delete_file',
      description: 'Delete a file from the current site builder project.',
      category: 'site-builder',
      parameters: {
        project_id: { type: 'string', description: 'The project ID', required: true },
        path: { type: 'string', description: 'Relative path to the file to delete', required: true },
      },
      execute: async (params) => {
        try {
          await projectManager.deleteFile(params.project_id as string, params.path as string);
          return `File deleted: ${params.path}`;
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
    {
      name: 'site_list_files',
      description: 'List the file tree of the current site builder project. Returns the directory structure.',
      category: 'site-builder',
      parameters: {
        project_id: { type: 'string', description: 'The project ID', required: true },
      },
      execute: async (params) => {
        try {
          const tree = projectManager.getFileTree(params.project_id as string);
          return JSON.stringify(tree, null, 2);
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
    {
      name: 'site_run_command',
      description: 'Run a shell command in the project directory. Use for installing packages, building, running one-off scripts, etc. Has a 30-second timeout. Do NOT use this to start dev servers — use the dashboard Start button or /api/sites/projects/:id/start instead.',
      category: 'site-builder',
      parameters: {
        project_id: { type: 'string', description: 'The project ID', required: true },
        command: { type: 'string', description: 'The command to run (e.g., "bun add react-router"). Do NOT run long-lived servers here.', required: true },
      },
      execute: async (params) => {
        const projectPath = projectManager.getProjectPath(params.project_id as string);
        if (!projectPath) return 'Error: Project not found';

        // Block commands that would start long-running servers
        const cmd = (params.command as string).trim();
        const blockedPatterns = /\b(make\s+dev|bun\s+--hot|vite\s*$|next\s+dev|npm\s+run\s+dev|yarn\s+dev)\b/i;
        if (blockedPatterns.test(cmd)) {
          return 'Error: Do not start dev servers with site_run_command. The dev server is managed automatically — use the Start button in the Sites page or POST /api/sites/projects/:id/start instead.';
        }

        try {
          const proc = Bun.spawn(['sh', '-c', cmd], {
            cwd: projectPath,
            stdout: 'pipe',
            stderr: 'pipe',
            env: process.env,
          });

          // 30-second timeout to prevent hanging
          const result = await Promise.race([
            (async () => {
              const [stdout, stderr] = await Promise.all([
                new Response(proc.stdout).text(),
                new Response(proc.stderr).text(),
              ]);
              const exitCode = await proc.exited;

              let output = '';
              if (stdout.trim()) output += stdout.trim();
              if (stderr.trim()) output += (output ? '\n' : '') + stderr.trim();
              if (exitCode !== 0) output += `\n(exit code: ${exitCode})`;
              return output || '(no output)';
            })(),
            new Promise<string>((resolve) => {
              setTimeout(() => {
                try { proc.kill(); } catch { /* ignore */ }
                resolve('Error: Command timed out after 30 seconds. If you were trying to start a dev server, use the Sites page Start button instead.');
              }, 30_000);
            }),
          ]);

          return result;
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
    {
      name: 'site_git_commit',
      description: 'Stage all changes and commit in the site builder project.',
      category: 'site-builder',
      parameters: {
        project_id: { type: 'string', description: 'The project ID', required: true },
        message: { type: 'string', description: 'Commit message', required: true },
      },
      execute: async (params) => {
        const projectPath = projectManager.getProjectPath(params.project_id as string);
        if (!projectPath) return 'Error: Project not found';

        try {
          const commit = await gitManager.autoCommit(projectPath, params.message as string);
          if (!commit) return 'Nothing to commit — working tree clean';
          return `Committed: ${commit.shortHash} ${commit.message}`;
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
  ];
}
