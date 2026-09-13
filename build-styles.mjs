/**
 * Compile frontend/scss/app.scss → frontend/static/css/app.css
 */

import * as sass from 'sass';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const frontendDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(frontendDir, '..');

fs.mkdirSync(path.join(frontendDir, 'static', 'css'), { recursive: true });

const inputFile = path.join(frontendDir, 'scss', 'app.scss');
const outputFile = path.join(frontendDir, 'static', 'css', 'app.css');

const result = sass.compile(inputFile, {
    style: 'compressed',
    sourceMap: true,
    loadPaths: [
        path.join(frontendDir, 'scss'),
        path.join(rootDir, 'scss')
    ]
});

let css = result.css;
if (result.sourceMap) {
    const mapJson = JSON.stringify(result.sourceMap);
    const base64 = Buffer.from(mapJson).toString('base64');
    css += `\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64} */`;
}

if (css.charCodeAt(0) === 0xFEFF) {
    css = css.slice(1);
}

fs.writeFileSync(outputFile, css);
console.log(`  ${path.relative(frontendDir, outputFile)}         ${(css.length / 1024).toFixed(1)}kb`);
