# 静态阅读交互适配

此分支保存神灯站点的静态详情卡片、浏览器本机收藏和菜单适配，包含导出器所需的主题、分类导航适配。站点实际部署仍在 littleweb/shengdeng.news，不从此分支发布。品牌、新闻、榜单快照、登录态和本机运行状态未同步。

通用分享卡片入口单独位于 feat/article-share-card 分支，并向原项目提交 PR；本静态适配不混入该 PR。原站点提交：2c8b00b8961b55b1a158390e1c060bdd89801210。

导出前先构建网页并启动原 API/Web，再运行 npm run export:static -- --base http://127.0.0.1:3000 --site-url https://your-domain.example。最终地址用于二维码与卡片上的域名。站点品牌配置沿用各自 site/；此参考分支保留上游默认品牌。
