// キャラ図鑑をキャラごとの HTML に分ける：dist/characters/<キャラ>.html
// どのキャラを最初に出すかを window.CHARA で埋め込む（ページ内の一覧から他のキャラにも切り替えられる）
import fs from 'node:fs';

const src = fs.readFileSync('dist/chara-src/chara.html', 'utf8');
const hand = fs.readFileSync('src/units/registry.ts', 'utf8').match(/HAND: UnitType\[\] = \[([^\]]*)\]/)[1].match(/'(\w+)'/g).map(s => s.slice(1, -1));
const buddies = [...fs.readFileSync('src/buddy/data.ts', 'utf8').matchAll(/id: '(\w+)', name: '([^']+)'/g)].map(m => m[1]);
const ids = [...hand, 'kingslime', ...buddies];

fs.mkdirSync('dist/characters', { recursive: true });
for (const id of ids) {
  const html = src.replace('<script type="module"', `<script>window.CHARA=${JSON.stringify(id)}</script>\n<script type="module"`);
  fs.writeFileSync(`dist/characters/${id}.html`, html);
}
fs.writeFileSync('dist/characters/index.html', src);
fs.rmSync('dist/chara-src', { recursive: true, force: true });
console.log(`キャラ図鑑：${ids.length} 体を dist/characters/ に出力しました`);
