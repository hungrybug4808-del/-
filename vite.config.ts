import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// ビルド結果を1つの HTML にまとめる（ダブルクリックで開いても遊べる）
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
});
