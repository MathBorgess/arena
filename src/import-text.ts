import { ArenaError } from './contracts.js';

/** Parse an authorized export as data. No source instruction is evaluated. */
export function parseTextExport(format: unknown, content: unknown): Record<string, unknown>[] {
  const invalid = (): never => { throw new ArenaError('INVALID_INPUT', 'Exportação inválida. Use uma lista JSON ou CSV com coluna text.'); };
  if (typeof content !== 'string' || !content || content.length > 5_000_000) return invalid();
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  let result: unknown;
  if (format === 'json') {
    try { result = JSON.parse(normalized); } catch { return invalid(); }
  } else if (format === 'csv') {
    const rows: string[][] = [];
    let row: string[] = [];
    let value = '';
    let quoted = false;
    let closed = false;
    const endCell = () => { row.push(value); value = ''; closed = false; };
    for (let index = 0; index < normalized.length; index++) {
      const character = normalized[index];
      if (quoted) {
        if (character === '"' && normalized[index + 1] === '"') { value += '"'; index++; }
        else if (character === '"') { quoted = false; closed = true; }
        else value += character;
      } else if (character === '"') {
        if (value || closed) return invalid();
        quoted = true;
      } else if (character === ',') endCell();
      else if (character === '\n') { endCell(); rows.push(row); row = []; }
      else { if (closed) return invalid(); value += character; }
    }
    if (quoted) return invalid();
    if (row.length || value || closed) { endCell(); rows.push(row); }
    const headers = rows.shift();
    if (!headers || !headers.includes('text') || new Set(headers).size !== headers.length) return invalid();
    result = rows.filter(cells => cells.some(cell => cell !== '')).map(cells => {
      if (cells.length !== headers.length) return invalid();
      return Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
    });
  } else return invalid();
  if (!Array.isArray(result) || !result.length || result.length > 1000 || result.some(item =>
    !item || typeof item !== 'object' || Array.isArray(item) || typeof item.text !== 'string' || !item.text.trim())) return invalid();
  return result;
}
