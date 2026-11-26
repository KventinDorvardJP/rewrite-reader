const { existsSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawn } = require('node:child_process');

const root = resolve(__dirname, '..');
const portable = join(root, '.local', 'electron', 'electron.exe');
const electron = process.env.REWRITE_ELECTRON ?? (existsSync(portable) ? portable : require('electron'));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [root, ...process.argv.slice(2)], { env, stdio: 'inherit' });
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
