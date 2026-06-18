// 数字人形象清单 —— 整个项目「改动一处，两处同步更新」的单一来源。
// 每个形象一套三态视频，放在 public/<dir>/ 下，文件名固定 idle / intro / speaking（后缀 .fallback.mp4）。
// 想换形象、加形象、改某态视频，只动这里；App 和 VideoAvatar 都从这里读，不会各改一遍。
//
// speaking 字段值 = 实际加载的视频文件名（不是状态名）：
//   仿真人的「说话」视频还没生成，先把 speaking 指到 'intro'（欢迎视频）占位 ——
//   于是「欢迎」和「说话」两态共用同一个视频文件（一份字节，两处同步播）。
//   将来生成了真说话视频：把 speaking.fallback.mp4 放进 avatar-sim/，并把下面这行
//   speaking: 'intro' 改回 speaking: 'speaking' 即可，组件无需改动。
export const AVATARS = {
  // 现有数字人（默认入口「3D 数字人演示」）
  default: {
    dir: 'avatar/',
    files: { idle: 'idle', intro: 'intro', speaking: 'speaking' },
  },
  // 3D 数字仿真人（入口「3D 数字仿真人演示」，白底新形象；说话视频暂用欢迎占位）
  sim: {
    dir: 'avatar-sim/',
    files: { idle: 'idle', intro: 'intro', speaking: 'intro' },
  },
}
