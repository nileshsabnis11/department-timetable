/** Create a readable, collision-resistant id such as "FAC-lz3k9a-8f1c2d". */
export function newId(prefix = 'ID') {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${stamp}-${random}`;
}
