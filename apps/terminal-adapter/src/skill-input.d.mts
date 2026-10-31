/** Authorized remote loader; JavaScript validates the returned body before expansion. */
export function expandSkillInput(text: string, loadSkill: (name: string) => Promise<unknown>): Promise<string | undefined>;
