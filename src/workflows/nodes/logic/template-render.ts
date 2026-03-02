import type { NodeDefinition } from '../registry.ts';
import { resolveTemplateString } from '../../template.ts';

export const templateRenderNode: NodeDefinition = {
  type: 'logic.template_render',
  label: 'Template Render',
  description: 'Render a template string against current data and store the result.',
  category: 'logic',
  icon: '📄',
  color: '#f59e0b',
  configSchema: {
    template: {
      type: 'template',
      label: 'Template',
      description: 'Template string with {{...}} expressions to resolve.',
      required: true,
      placeholder: 'Hello {{data.name}}, you have {{data.count}} items.',
    },
  },
  inputs: ['default'],
  outputs: ['default'],
  execute: async (input, config, ctx) => {
    const template = String(config.template ?? '');
    ctx.logger.info(`Rendering template (${template.length} chars)`);

    const templateCtx = {
      variables: input.variables,
      nodeOutputs: new Map<string, Record<string, unknown>>(),
      triggerData: (input.data['$trigger'] as Record<string, unknown>) ?? {},
      env: Object.fromEntries(
        Object.entries(process.env).filter(([, v]) => v !== undefined) as [string, string][]
      ),
    };

    const rendered = resolveTemplateString(template, templateCtx);

    return {
      data: {
        ...input.data,
        rendered_output: rendered,
      },
    };
  },
};
