export function previewExport(format, content) {
  const invalid = () => { throw new Error('Use uma lista JSON ou CSV válido com coluna text.'); };
  if (content.length > 900_000) throw new Error('Selecione um arquivo menor que 900 KB para o visualizador local.');
  const text = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  let items;
  if (format === 'json') { try { items = JSON.parse(text); } catch { invalid(); } }
  else {
    const rows = []; let cells = [], cell = '', quoted = false, closed = false;
    const finish = () => { cells.push(cell); cell = ''; closed = false; };
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (quoted) { if (char === '"' && text[index + 1] === '"') { cell += '"'; index++; } else if (char === '"') { quoted = false; closed = true; } else cell += char; }
      else if (char === '"') { if (cell || closed) invalid(); quoted = true; }
      else if (char === ',') finish();
      else if (char === '\n') { finish(); rows.push(cells); cells = []; }
      else { if (closed) invalid(); cell += char; }
    }
    if (quoted) invalid();
    if (cells.length || cell || closed) { finish(); rows.push(cells); }
    const headers = rows.shift(); if (!headers?.includes('text') || new Set(headers).size !== headers.length) invalid();
    items = rows.filter(row => row.some(value => value !== '')).map(row => { if (row.length !== headers.length) invalid(); return Object.fromEntries(headers.map((header, index) => [header, row[index]])); });
  }
  if (!Array.isArray(items) || !items.length || items.length > 1000 || items.some(item => !item || typeof item.text !== 'string' || !item.text.trim())) invalid();
  return items;
}
