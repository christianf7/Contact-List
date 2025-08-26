import fs from 'fs';
import path from 'path';

export function render(view: string, data: Record<string, any> = {}): string {
  const file = path.join(__dirname, '..', 'views', view);
  const template = fs.readFileSync(file, 'utf8');
  const code = template
    .replace(/`/g, '\\`')
    .replace(/<%[=-](.+?)%>/g, '${$1}')
    .replace(/<%(.+?)%>/gs, (_, block) => '`;\n' + block.trim() + '\nhtml+=`');

  const compiled = new Function('data', `
    let html = '';
    with (data) {
      html += \`${code}\`;
    }
    return html;
  `);

  return compiled(data);
}
