# 校园运动打卡

一个无需服务器的个人运动打卡网页。包含按星期切换的训练计划、动作说明、休息计时、体重与腰围记录，以及本地数据导出。

## GitHub Pages 部署

1. 登录 GitHub，新建 **Public** 仓库 `campus-fitness`。
2. 在仓库主页点击 **Add file → Upload files**，上传 `index.html`（必须位于仓库根目录），提交。
3. 打开 **Settings → Pages**，在 **Build and deployment** 中选择 **Deploy from a branch**，Branch 选 `main`、Folder 选 `/ (root)`，保存。
4. 等待几分钟后访问 `https://你的GitHub用户名.github.io/campus-fitness/`。
5. iPhone Safari 打开该地址，点击分享 → 添加到主屏幕。

## 数据说明

数据保存在浏览器本地 localStorage 中，不会自动同步到其他设备或 ChatGPT。清除 Safari 网站数据、换设备或换域名可能丢失记录。请定期使用网页的导出功能备份。
