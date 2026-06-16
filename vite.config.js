import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 上线后部署在 h100.jsai100.com/a900/ 子路径下：
// 生产构建用 '/a900/' 作为 base，本地开发用 '/'。
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/a900/' : '/',
  plugins: [react()],
}))
