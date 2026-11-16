const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const name of fs.readdirSync(root)) {
    if (name.endsWith('.html')) {
        fs.copyFileSync(path.join(root, name), path.join(output, name));
    }
}

for (const name of ['support.css', 'wprev.png']) {
    fs.copyFileSync(path.join(root, name), path.join(output, name));
}

for (const name of ['css', 'images', 'js']) {
    fs.cpSync(path.join(root, 'assets', name), path.join(output, 'assets', name), {
        recursive: true
    });
}
