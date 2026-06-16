import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 上线后部署在 h100.jsai100.com/a900/ 子路径下：
// 生产构建用 '/a900/' 作为 base，本地开发用 '/'。
// 本地 dev 把 /api 反代到 Express 后端（API_PORT=4009，见 .env.local）。
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/a900/' : '/',
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 3008,
    proxy: {
      '/api': { target: 'http://localhost:4009', changeOrigin: true },
    },
  },
}))
