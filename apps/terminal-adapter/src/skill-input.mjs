/** Expand explicit inline skill selections through the authorized Host, never local files. */
export async function expandSkillInput(text, loadSkill) {
  const token = /(^|\s)\/skill:([^\s]+)/g;
  const names = [...new Set([...text.matchAll(token)].map(match => match[2]))];
  if (!names.length) return undefined;
  const blocks = [];
  // Preserve chosen order, deduplicate, and refuse the whole input if any body is unavailable.
  for (const name of names) {
    const skill = await loadSkill(name);
    if (!skill || typeof skill !== 'object' || skill.name !== name ||
        typeof skill.content !== 'string' || typeof skill.filePath !== 'string' || typeof skill.baseDir !== 'string')
      throw Error('Invalid host skill body; no model input was submitted');
    blocks.push(`<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${skill.content.trim()}\n</skill>`);
  }
  const prompt = text.replace(token, '$1').trim();
  return [...blocks, ...(prompt ? [prompt] : [])].join('\n\n');
}
