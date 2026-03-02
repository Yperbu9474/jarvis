import type { NodeDefinition } from '../registry.ts';

export const calendarActionNode: NodeDefinition = {
  type: 'action.calendar_action',
  label: 'Calendar Action',
  description: 'Create, update, or delete a Google Calendar event.',
  category: 'action',
  icon: '📆',
  color: '#3b82f6',
  configSchema: {
    action: {
      type: 'select',
      label: 'Action',
      description: 'Operation to perform on the calendar.',
      required: true,
      default: 'create',
      options: [
        { label: 'Create', value: 'create' },
        { label: 'Update', value: 'update' },
        { label: 'Delete', value: 'delete' },
      ],
    },
    title: {
      type: 'template',
      label: 'Title',
      description: 'Event title. Supports template expressions.',
      required: true,
      placeholder: 'Team standup',
    },
    start: {
      type: 'template',
      label: 'Start Time',
      description: 'ISO 8601 start datetime. Supports template expressions.',
      required: true,
      placeholder: '2026-03-02T09:00:00Z',
    },
    end: {
      type: 'template',
      label: 'End Time',
      description: 'ISO 8601 end datetime. Supports template expressions.',
      required: true,
      placeholder: '2026-03-02T09:30:00Z',
    },
  },
  inputs: ['default'],
  outputs: ['default'],
  execute: async (input, config, ctx) => {
    const action = String(config.action ?? 'create');
    const title = String(config.title ?? '');
    const start = String(config.start ?? '');
    const end = String(config.end ?? '');

    ctx.logger.info(`Calendar action: ${action} event "${title}" from ${start} to ${end}`);

    // Placeholder — Google Calendar API integration wired via google-api.ts in Phase 4
    const note = 'Google Calendar integration not yet wired to workflow engine — event not created';
    ctx.logger.warn(note);

    return {
      data: {
        ...input.data,
        calendar_action: action,
        title,
        start,
        end,
        success: false,
        note,
        executedAt: Date.now(),
      },
    };
  },
};
