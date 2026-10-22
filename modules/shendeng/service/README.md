# 神灯站点常驻服务补丁

本分支同步常驻服务及热点数值变化的持续发布修复。完整站点、采编与导入模块、行业配置、期刊和发布工作流以 [littleweb/shengdeng.news](https://github.com/littleweb/shengdeng.news) 为准；本分支用于跟踪站点补丁，不是第二份部署。

可运行 `python3 -m unittest discover -s modules/shendeng/service/tests -v` 验证热点数值变化触发发布、时间戳变化不重复发布、独立远端改动不被覆盖。真实运行还需完整站点以及本机安装生成的 .data/service/runtime.json；本机配置、登录态和密钥不进入此分支。
