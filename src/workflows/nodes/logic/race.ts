import type { NodeDefinition } from '../registry.ts';

export const raceNode: NodeDefinition = {
  type: 'logic.race',
  label: 'Race',
  description: 'Pass through whichever input branch arrives first; cancel the rest after the timeout.',
  category: 'logic',
  icon: '🏁',
  color: '#f59e0b',
  configSchema: {
    timeout_ms: {
      type: 'number',
      label: 'Timeout (ms)',
      description: 'If no branch completes within this time, the node fails.',
      required: true,
      default: 30000,
    },
  },
  inputs: ['default'],
  outputs: ['winner'],
  execute: async (input, config, ctx) => {
    // Race semantics are handled at the graph level by the executor.
    // This execute function is called once the first branch result arrives.
    const timeoutMs = typeof config.timeout_ms === 'number' ? config.timeout_ms : 30000;
    ctx.logger.info(`Race node: first winner arrived (timeout was ${timeoutMs}ms)`);

    return {
      data: {
        ...input.data,
        race_winner: true,
        timeout_ms: timeoutMs,
      },
      route: 'winner',
    };
  },
};
