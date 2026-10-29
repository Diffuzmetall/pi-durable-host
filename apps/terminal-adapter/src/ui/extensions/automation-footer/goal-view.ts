import { stripVTControlCharacters } from 'node:util';
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import type { NativeGoal, NativeGoalsState } from '../../native-types.ts';

const labels: Record<NativeGoal['status'], string> = {
  draft: 'подготовлена', running: 'выполняется', checking: 'проверка', reporting: 'отчёт',
  waiting: 'ожидает', paused: 'пауза', completed: 'завершена', cancelled: 'отменена',
};
const clean = (value: unknown) => stripVTControlCharacters(String(value ?? '')).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').replace(/\s+/g, ' ').trim();
const md = (value: unknown) => clean(value).replace(/[\\`*_\[\]<>]/g, '\\$&');
const stateLabel = (status: string) => labels[status as NativeGoal['status']] ?? clean(status);

export function visibleNativeGoal(doc: NativeGoalsState | undefined): NativeGoal | undefined {
  if (!doc) return;
  const active = doc.active && doc.goals[doc.active];
  if (active && active.status !== 'cancelled') return active;
  return Object.values(doc.goals).filter(goal => goal.status !== 'cancelled')
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)[0];
}

/** Human TUI shortcuts inspect the displayed Goal and include saved results, not only active work. */
export function goalOperatorInput(input: string, doc: NativeGoalsState | undefined): string {
  const text = input.trim();
  if (text === '/goal list') return '/goal list --archive';
  const goal = text === '/goal status' ? visibleNativeGoal(doc) : undefined;
  return goal ? `/goal status ${goal.id}` : input;
}

/** One bounded native row; no timer, polling or model-generated title. */
export function renderNativeGoalRow(doc: NativeGoalsState | undefined, width: number): string[] {
  const goal = visibleNativeGoal(doc);
  if (!goal || width < 1) return [];
  const title = clean(goal.objective);
  const calls = goal.limits !== 'none' && goal.limits.maxCalls !== undefined
    ? `${goal.callsUsed}/${goal.limits.maxCalls} выз.` : `${goal.callsUsed} выз.`;
  const suffix = ` · ${stateLabel(goal.status)} · ${calls}`;
  const prefix = '🎯 ';
  const room = width - visibleWidth(prefix + suffix);
  const text = room >= 8 ? prefix + truncateToWidth(title, room, '…') + suffix
    : truncateToWidth(`${prefix}${title} · ${stateLabel(goal.status)}`, width, '…');
  return [text];
}

function limitsText(goal: { limits?: NativeGoal['limits']; callsUsed?: number; activeMsUsed?: number; accounting?: { tokensUsed?: number } }): string {
  const limits = goal.limits;
  const calls = goal.callsUsed ?? 0;
  const parts = [`Вызовы модели: **${calls}${limits && limits !== 'none' && limits.maxCalls !== undefined ? ` / ${limits.maxCalls}` : ''}**`];
  if (limits === 'none') parts.push('Лимиты: без ограничений (согласовано)');
  if (limits && limits !== 'none' && limits.activeMs !== undefined)
    parts.push(`Активное время: ${Math.round((goal.activeMsUsed ?? 0) / 1000)} / ${Math.round(limits.activeMs / 1000)} с`);
  if (limits && limits !== 'none' && limits.tokens !== undefined)
    parts.push(`Токены: ${goal.accounting?.tokensUsed ?? 'учёт отдельно'} / ${limits.tokens}`);
  return parts.join(' · ');
}

/** Operator presentation only. Model-facing service replies remain structured JSON. */
export function formatGoalResult(message: string): string {
  let data: any;
  try { data = JSON.parse(message); } catch { return message; }
  if (Array.isArray(data)) {
    const goals = data.filter(goal => goal && typeof goal.objective === 'string' && typeof goal.id === 'string');
    if (!goals.length) return '## 🎯 Цели\n\nСохранённых целей пока нет.\n\nНовую цель можно описать агенту обычными словами.';
    return '## 🎯 Цели\n\n' + goals.map(goal =>
      `- **${md(goal.objective)}** — ${stateLabel(goal.status)}\n  ${limitsText(goal)}\n  ID: \`${clean(goal.id)}\``).join('\n\n');
  }
  if (data && typeof data.objective === 'string' && typeof data.id === 'string') {
    const goal = data as NativeGoal & { accounting?: { tokensUsed?: number } };
    const lines = [`## 🎯 ${md(goal.objective)}`, '', `Состояние: **${stateLabel(goal.status)}**`, '', limitsText(goal), '', `ID: \`${clean(goal.id)}\``];
    if (goal.reason) lines.push('', `Причина: ${md(goal.reason)}`);
    if (goal.criteria?.length) {
      lines.push('', '### Критерии');
      for (const criterion of goal.criteria) {
        const evidence = goal.evidence?.filter(item => item.criterionId === criterion.id && item.revision === goal.revision).at(-1);
        const passed = evidence?.outcome === 'pass' && !!evidence.check.trim() && !!evidence.proof.trim() && (!criterion.human || evidence.humanApproved);
        lines.push(`- ${passed ? '✓' : evidence?.outcome === 'fail' ? '✗' : '○'} ${md(criterion.text)}${criterion.human ? ' (личная приёмка)' : ''}`);
      }
    }
    if (goal.skills?.length) lines.push('', `Навыки: ${goal.skills.map(md).join(', ')}`);
    if (goal.permissions?.scope?.length) lines.push('', '### Границы', ...goal.permissions.scope.map(scope => `- ${md(scope)}`));
    if (goal.reportPath) lines.push('', `Отчёт: \`${clean(goal.reportPath)}\``);
    return lines.join('\n');
  }
  if (data && typeof data === 'object' && 'limits' in data) return '## 🎯 Лимиты цели\n\n' + limitsText(data);
  return '```json\n' + JSON.stringify(data, null, 2) + '\n```';
}
