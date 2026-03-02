import type { NodeDefinition } from '../registry.ts';

export const loopNode: NodeDefinition = {
  type: 'logic.loop',
  label: 'Loop',
  description: 'Iterate over an array, emitting each item on the "item" output.',
  category: 'logic',
  icon: '🔁',
  color: '#f59e0b',
  configSchema: {
    items_path: {
      type: 'template',
      label: 'Items Path / Expression',
      description: 'A template expression that resolves to an array, e.g. "{{data.results}}".',
      required: true,
      placeholder: '{{data.items}}',
    },
    max_iterations: {
      type: 'number',
      label: 'Max Iterations',
      description: 'Safety cap on the number of iterations.',
      required: false,
      default: 100,
    },
  },
  inputs: ['default'],
  outputs: ['item', 'done'],
  execute: async (input, config, ctx) => {
    const maxIterations = typeof config.max_iterations === 'number' ? config.max_iterations : 100;

    // items_path is already resolved to its value by the template engine upstream;
    // if it came through as a raw value, use it directly.
    let items: unknown[] = [];
    const rawItems = config.items_path;
    if (Array.isArray(rawItems)) {
      items = rawItems;
    } else if (typeof rawItems === 'string') {
      // The executor resolves templates before calling execute, so if still a string
      // it may be a dot-path into input.data
      const resolved = rawItems.split('.').reduce<unknown>((acc, key) => {
        if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
        return undefined;
      }, input.data as unknown);
      if (Array.isArray(resolved)) items = resolved;
    }

    const capped = items.slice(0, maxIterations);
    if (items.length > maxIterations) {
      ctx.logger.warn(`Loop capped at ${maxIterations} iterations (total items: ${items.length})`);
    }

    ctx.logger.info(`Loop: iterating over ${capped.length} items`);

    // The executor drives loops by reading route='item' repeatedly until 'done'.
    // Here we emit the first item and let the engine call us again per iteration.
    // For now we return the full array on route='done' and let the engine handle iteration.
    // NOTE: Full loop execution semantics are implemented in the workflow executor (Phase 1).
    return {
      data: {
        ...input.data,
        loop_items: capped,
        loop_total: capped.length,
        loop_index: 0,
      },
      route: capped.length > 0 ? 'item' : 'done',
    };
  },
};
