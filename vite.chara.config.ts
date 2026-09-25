import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// キャラ図鑑（chara.html）を1つの HTML にまとめる。キャラごとのファイルは scripts/chara-pages.mjs が作る
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { outDir: 'dist/chara-src', emptyOutDir: true, rollupOptions: { input: 'chara.html' } },
});
