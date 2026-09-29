# 第四届中小学教师 AI 创新教学案例大赛评审系统

这是评审网站的公开前端与 API 代理源代码。网站调用评审人自行填写的 OpenAI 兼容 API 地址、模型和 API Key；项目不包含默认 API Key。案例文档和密钥会经由项目配置的 API 代理转发至评审人选择的模型服务商。

## 发布配置

GitHub Pages 工作流需要仓库变量 `REVIEW_API_BASE_URL`，值为 API Worker 的 HTTPS 根地址。API Worker 需单独部署，并将 `CORS_ALLOWED_ORIGIN` 设为 Pages 站点来源。

## 本次公开文件

- `.github/workflows/pages.yml`
- `.gitignore`
- `index.html`
- `package.json`
- `package-lock.json`
- `vite.config.mjs`
- `wrangler.toml`
- `src`
- `public`
- `api`
- `worker`
- `scripts/prepare-sites-build.mjs`
- `.ecnu-review-site.json`（专用站点标记）
- `README.md`（本说明）

未复制本机依赖目录、构建输出、评审案例、用户密钥或工作区其他文件。
