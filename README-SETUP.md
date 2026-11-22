校园运动打卡：GitHub 私有记录同步

目录说明
- index.html、图标文件、sync.js、sync-config.js：上传到现有 campus-fitness 网站仓库根目录。
- worker/index.js、worker/wrangler.jsonc：部署 Cloudflare Worker 的服务端代码。服务端密钥只通过 Cloudflare Secrets 设置，绝不可上传到 GitHub。

部署步骤（按顺序）
1. 在 GitHub 新建「campus-fitness-data」仓库，选 Private，并勾选 Add a README file，确保默认分支为 main。不要把这个数据仓库设为公开。不要把记录放在网站仓库。
2. 确认现有网站网址。在 GitHub 网站仓库 Settings → Pages 查看 Visit site 的地址。如果不是 https://aurora108.github.io/campus-fitness/，修改 worker/wrangler.jsonc 的 SITE_URL，必须包含末尾的 /。检查 GITHUB_OWNER 和 GITHUB_USER_ID 与你的账号相符。
3. 注册/登录 Cloudflare，在自己的电脑安装 Node.js，然后在终端进入 worker 目录，运行「npx wrangler login」和「npx wrangler deploy」。记下输出的 https://...workers.dev 地址。
4. GitHub → 头像 → Settings → Developer settings → OAuth Apps → New OAuth App。Application name 随意，如 Campus Fitness Sync；Homepage URL 填上面的网站地址；Authorization callback URL 填「https://你的-worker-地址.workers.dev/auth/callback」。创建后复制 Client ID，并生成 Client Secret。
5. 在 worker 目录执行以下命令，每条命令会提示你输入对应值（粘贴后回车）；不要把密钥写进任何文件或聊天消息：
   npx wrangler secret put GITHUB_CLIENT_ID
   npx wrangler secret put GITHUB_CLIENT_SECRET
   npx wrangler secret put SESSION_KEY
   SESSION_KEY 请先在本机执行「openssl rand -base64 32」生成一串随机字符，再粘贴给最后一条命令。
6. 修改 sync-config.js，把 REPLACE_WITH_YOUR_WORKER 换成实际的 Worker 地址前缀；将 index.html、sync-config.js、sync.js、favicon.png、apple-touch-icon.png 上传到现有 campus-fitness 仓库根目录。worker 目录也可以放在这个公开的网站仓库中，但其中不能含任何密钥。刷新网站（必要时强制刷新）。
7. 网站顶部点击「登录 GitHub 开始同步」，在 GitHub 授权页面确认是你自己创建的 OAuth App。登录后检查提示为「记录已同步到 GitHub 私有仓库」。在私有仓库里确认 records.json 出现，再在另一台设备登录同一个 GitHub 账号确认记录能读取。

安全和使用提醒
- 网站所在的 campus-fitness 仓库目前公开，GitHub Free 的个人仓库改为 Private 后将不能继续用免费的 GitHub Pages 发布。即使是付费计划从私密仓库发布 Pages，网页本身通常仍公开。私密的是 campus-fitness-data 中的记录。
- OAuth 授权范围是 repo，GitHub 会提示它可访问你授权账号的私有仓库；这是 OAuth App 访问私有数据仓库所需的范围。务必只在你自己创建的 App 上授权。服务端代码把写入地址限定为你的数据仓库。
- 页面上的登录令牌是加密的，仅保存在当前浏览器本地；不要在公共设备上登录。点击「退出登录」会清除该设备的登录状态，也可在 GitHub Settings → Applications 撤销授权。
- 点击打卡会先保存本机，再自动同步到 GitHub。看到“同步失败”时不要清除浏览器数据，先导出备份并重试。
- 首次登录会合并当前设备的本地记录和私有仓库记录。如果有同一天在多设备离线修改，不能保证自动解决每一个冲突，请核对该日期。
- 每次保存会提交 records.json；符合 GitHub 贡献统计条件的提交才会显示在 Contributions。私有仓库活动可能需要在个人资料中开启私有贡献显示，其他人看不到具体记录。
