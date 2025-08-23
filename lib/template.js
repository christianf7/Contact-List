const fs = require('fs');
const path = require('path');

function render(view, data = {}) {
  const file = path.join(__dirname, '..', 'views', view);
  const template = fs.readFileSync(file, 'utf8');
  const compiled = new Function('data', `
    let html = '';
    with (data) {
      html += \`
${template
  .replace(/`/g, '\\`')
  .replace(/<%=(.+?)%>/g, '${$1}')
  .replace(/<%(.+?)%>/gs, '`; $1 html+=`')}
\`;
    }
    return html;
  `);
  return compiled(data);
}

module.exports = { render };
