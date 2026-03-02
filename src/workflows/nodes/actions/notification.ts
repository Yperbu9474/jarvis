import type { NodeDefinition } from '../registry.ts';

export const notificationAction: NodeDefinition = {
  type: 'action.notification',
  label: 'Desktop Notification',
  description: 'Send a desktop notification via the OS notification system.',
  category: 'action',
  icon: '🔔',
  color: '#3b82f6',
  configSchema: {
    title: {
      type: 'template',
      label: 'Title',
      description: 'Notification title. Supports template expressions.',
      required: true,
      placeholder: 'JARVIS Alert',
    },
    body: {
      type: 'template',
      label: 'Body',
      description: 'Notification body text. Supports template expressions.',
      required: true,
      placeholder: 'Something happened: {{data.message}}',
    },
    urgency: {
      type: 'select',
      label: 'Urgency',
      description: 'Notification urgency level.',
      required: true,
      default: 'normal',
      options: [
        { label: 'Low', value: 'low' },
        { label: 'Normal', value: 'normal' },
        { label: 'High', value: 'high' },
      ],
    },
  },
  inputs: ['default'],
  outputs: ['default'],
  execute: async (input, config, ctx) => {
    const title = String(config.title ?? 'JARVIS');
    const body = String(config.body ?? '');
    const urgency = String(config.urgency ?? 'normal');

    ctx.logger.info(`Sending desktop notification: [${urgency}] ${title}`);

    // Try notify-send on Linux/WSLg, fall back to logging
    let sent = false;
    try {
      const urgencyFlag = urgency === 'high' ? 'critical' : urgency === 'low' ? 'low' : 'normal';
      const proc = Bun.spawn(
        ['notify-send', '-u', urgencyFlag, '--', title, body],
        { stdout: 'pipe', stderr: 'pipe' }
      );
      await proc.exited;
      sent = proc.exitCode === 0;
    } catch {
      ctx.logger.warn('notify-send not available — notification logged only');
    }

    return {
      data: {
        ...input.data,
        notification_sent: sent,
        title,
        body,
        urgency,
        sentAt: Date.now(),
      },
    };
  },
};
