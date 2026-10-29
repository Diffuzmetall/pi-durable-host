import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { defineExtension, hook, ToolTask, type Harness } from '@earendil-works/pi-durable';
import { createSessionGoalService } from './session-goals.js';
import { createNativeGoalControl } from './native-goal-control.js';
import { createSchedules, cancelScheduleTask } from './schedules.js';

/** Localized installed automation composition: lifecycle/authority are owned by the host, not memory. */
export function createAutomation(options: Parameters<typeof createSessionGoalService>[0]) {
  if (typeof options.admit !== 'function') throw Error('Automation requires trusted host input admission');
  const admit = options.admit;
  let host: Harness | undefined;
  let closed = false;
  const authorize = async (...args: Parameters<typeof options.authorize>) =>
    !closed && host !== undefined && await options.authorize(...args) === true;
  const goals = createSessionGoalService({ ...options, authorize, admit });
  const requireRoot = async (...args: Parameters<typeof options.authorize>) => {
    if (!await authorize(...args)) throw Error('AUTOMATION_ROOT_AUTHORITY_REQUIRED');
  };
  const authority = defineExtension({ name: 'local-host-automation-authority', hooks: [hook(ToolTask, {
    beforeTool: async (call, api, context) => {
      if (call.name === 'bash' && call.parent?.callId.startsWith('goal-check:')) throw Error('LEGACY_GOAL_DISABLED');
      if (call.name === 'schedule' && call.arguments.action === 'add') await requireRoot(api.conversationId, context);
      return undefined;
    },
  })] });
  const schedules = createSchedules({
    admitInput: async (conversation, requestId, context) => {
      await requireRoot(conversation.id, context);
      await admit(conversation, requestId, context);
      await requireRoot(conversation.id, context);
    },
    cancelTask: async (conversationId, taskId, context) => {
      if (!host || closed) throw Error('SCHEDULE_CANCELLATION_UNAVAILABLE');
      await cancelScheduleTask(host, conversationId, taskId, context);
    },
  });
  return {
    extensions: [authority, schedules, goals.archiveExtension, goals.extension, createNativeGoalControl(goals, authorize)],
    goals,
    async bind(value: Harness) {
      if (closed || host) throw Error('Automation lifecycle already bound or closed');
      host = value;
      await goals.bind(value).catch(error => { closed = true; host = undefined; throw error; });
    },
    async shutdown(context = BACKGROUND_CONTEXT) {
      closed = true;
      if (host) await goals.shutdown(context);
      host = undefined;
    },
  };
}
