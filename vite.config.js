import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app.html'), // <-- เพิ่มบรรทัดนี้ เพื่อให้ Vite ยอมสร้างไฟล์ app.html ออกมาใน dist
      },
    },
  },
});
