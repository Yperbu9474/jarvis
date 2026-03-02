import type { NodeDefinition } from '../registry.ts';

export const mergeNode: NodeDefinition = {
  type: 'logic.merge',
  label: 'Merge',
  description: 'Wait for two input branches and merge their data into one output.',
  category: 'logic',
  icon: '🔗',
  color: '#f59e0b',
  configSchema: {},
  inputs: ['input_1', 'input_2'],
  outputs: ['default'],
  execute: async (input, _config, ctx) => {
    ctx.logger.info('Merging inputs');

    // The workflow executor collects both inputs and passes combined data here.
    // input.data may contain input_1 and input_2 keys set by the executor,
    // or we simply deep-merge whatever is in input.data.
    const merged: Record<string, unknown> = { ...input.data };

    return {
      data: merged,
    };
  },
};
