# A900 维护经验与问题索引

开始前读取 [Coding 共用规则](../../AGENTS.md)，结束前运行 [共用 check/close](../../.gstack/maintenance/README.md)。旧验证不是本轮业务验收。

## 按症状检索
<!-- EXPERIENCE_INDEX_START -->
| 编号 | 问题 / 复用场景 | 原因状态 |
|---|---|---|
| [A900-K001](#a900-k001) | 动态朗读无声、missing Authorization header、旧接口资源不匹配 | 协议缺陷已确认；已发布并验证真实合成 |
<!-- EXPERIENCE_INDEX_END -->

## 经验条目
<a id="a900-k001"></a>
### A900-K001｜语音接口协议与Uranus音色资源不匹配
- 命中/修改触发：用户要求扩查A300题目无声同类问题；运行时/生成脚本调用v1却仅传X-Api-App-Key等v3风格请求头。
- 原因状态与证据：源码协议错误已确认。线上只读日志尾部命中6次 missing Authorization header。 当前本地音色均为zh_female_vv_uranus_bigtts，与A300已验证的2.0音色一致；只比较配置是否相同，不记录凭证。首次契约测试失败（A900新模块尚未抽取，首次失败是缺模块，不冒充供应商故障复现）。
- 处理与适用边界：基于版本0.4.41、HEAD 579ce86的工作区修复；切v3单向HTTP接口，X-Api-App-Id/Access-Key及seed-tts-2.0；逐段解码后拼MP3，必须有完成标志，出错仍返回空音频；保留本项目原重试行为，mock模式不外调。脚本与运行时复用项目内provider，无跨仓依赖。只适用于当前2.0音色；未来换1.0音色需匹配资源，不能机械套用。
- 防再犯检查：Node24执行 `node --test tests/volc-tts.test.mjs`；合并前运行项目build与相关测试；发布前使用准确发布构建验证真实合成和音频解码，不能只看HTTP200、mock或题目文字出现。
- 验证范围与日期：2026-09-22；语音回归9/9（含欢迎语速）；既有LLM契约7/7；Vite构建及本地桌面/手机模拟问答流程通过。 本轮未逐项目调用付费真实合成，未部署/重启生产，未重新生成静态音频；不能据此声称线上修复或真机扬声器验收。
- 复用去向：复用A300-K001已验证协议；本项目留证。共享候选仍待独立复核，不自动修改共享skill。
- 来源：[跨项目任务与验收清单](../../.planning/2026-09-22-cross-project-tts-audit.md)、[运行时合成](../lib/volc-tts.js)、[契约回归](../tests/volc-tts.test.mjs)、[A300原始证据](../../A300-职业导航-career-nav/docs/maintenance-experience.md)、[官方V3接口](https://docs.volcengine.com/docs/DoubaoVoice/HTTPChunkedSSEUnidirectionalStreaming-V3?lang=zh)。

## 历史覆盖与待核
- 接入日期：2026-09-22；初始化只建立版本起点，不确认历史全部已审。
- 已查当前语音实现及Git来源；历史工作树/归档副本未批量更改。
- 原有AGENTS/CLAUDE等他人未提交改动保留；只登记本轮审查的文件，不把入口新增一段当作整份规则审核。
- 当前未验：上述真实发布、真机播放，以及未完成的完整业务回归；测试和发布状态以跨项目清单为准。

## 检查器未覆盖扩展名的本轮审阅
- 共用登记器不收录.mjs/.cjs，未扩大共享白名单。下列文件已逐项语法检查，并由语音契约/构建验证其行为；哈希仅锁定被审版本，不单独证明业务正确。
- `lib/volc-tts-provider.mjs` SHA256 `a1e6d8569428c129d7dc5a503b99e6e045180b68520e99bd73224c672a662603`
- `scripts/generate-welcome-audio.mjs` SHA256 `3e4b39452452b8847b0e48f885f874e171948b51740f28b0a8080ba0c1299574`
- `tests/volc-tts.test.mjs` SHA256 `23af3991edd975aa5c355e36910e7465424d5ef8ceb0f17734a290fb8e9d859a`

## 本轮独立复核
- 2026-09-22：a300_readonly_review只读检查六项目协议、重试边界、A900语速、C100模块兼容及项目入口可发现性，未发现阻断问题。未独立重跑测试、未验证实际发布或真机播放。

## 2026-09-22 发布验收（更新前述待发布状态）
- 版本 v0.4.42，发布源码 d1ca60629927735e8a3924b59fe2de022579f6bf；本地tag/GitHub tag/生产发布源码已核对。服务器准确源码语音契约及生产构建通过，隔离实例真实合成成功后才切换；生产接口返回MP3 29037字节/3.624秒、24000Hz，解码peak=0.3878。
- 正式HTTPS页面最后一跳200、Chromium资源无400+响应，生产接口音频在浏览器AudioContext整段播放至ended，nonSilent=true；未做真机扬声器听感验收，不把播放探针当成全业务回归。A200使用60秒虚构会话检查受保护TTS，不写用户/报告数据库。
- 回滚构建：/var/tmp/codex-cross-tts-release-20260922/A900/previousdist；旧源码 579ce86ec05932423d9d231b7e09a0ef7f913b93。发布后新增错误日志0字节，其他PM2进程PID未改变。未改生产env/业务数据/静态音频；A000/A100额外验证正式源码实时合成。
- 证据：/var/tmp/codex-cross-tts-release-20260922/A900 下canary-check.json、production-check.json及build.log；本机Temp/codex-cross-tts-20260922/A900-browser.json。
