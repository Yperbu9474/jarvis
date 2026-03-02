import type { NodeDefinition } from '../registry.ts';

export const agentTaskAction: NodeDefinition = {
  type: 'action.agent_task',
  label: 'Agent Task',
  description: 'Dispatch a task to a sub-agent and await its response.',
  category: 'action',
  icon: '🤖',
  color: '#3b82f6',
  configSchema: {
    task: {
      type: 'template',
      label: 'Task',
      description: 'The task description to send to the sub-agent. Supports template expressions.',
      required: true,
      placeholder: 'Summarize the following: {{data.content}}',
    },
    max_iterations: {
      type: 'number',
      label: 'Max Iterations',
      description: 'Maximum tool-loop iterations the sub-agent may run.',
      required: false,
      default: 15,
    },
  },
  inputs: ['default'],
  outputs: ['default'],
  execute: async (input, config, ctx) => {
    const task = String(config.task ?? '');
    const maxIterations = typeof config.max_iterations === 'number' ? config.max_iterations : 15;

    ctx.logger.info(`Dispatching agent task (max ${maxIterations} iterations): ${task.slice(0, 120)}`);

    // Placeholder — full sub-agent integration wired in Phase 4 (Triggers + Scheduling)
    // The LLMManager and AgentOrchestrator references will be threaded through ctx.llmManager
    // once the ExecutionContext is enriched with the orchestrator factory.
    const response = 'Agent task placeholder — sub-agent integration pending Phase 4.';
    const success = true;

    ctx.logger.info('Agent task completed (placeholder)');

    return {
      data: {
        ...input.data,
        task,
        response,
        success,
        max_iterations: maxIterations,
      },
    };
  },
};
