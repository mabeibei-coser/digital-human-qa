// 数字人形象清单 —— 整个项目「改动一处，两处同步更新」的单一来源。
// 每个形象一套三态视频，放在 public/<dir>/ 下，文件名固定 idle / intro / speaking（后缀 .fallback.mp4）。
// 想换形象、加形象、改某态视频，只动这里；App 和 VideoAvatar 都从这里读，不会各改一遍。
//
// speaking 字段值 = 实际加载的视频文件名（不是状态名）。两个形象现都三态齐全（各有独立说话视频）。
export const AVATARS = {
  // 现有数字人（默认入口「3D 数字人演示」）
  default: {
    dir: 'avatar/',
    files: { idle: 'idle', intro: 'intro', speaking: 'speaking' },
  },
  // 3D 数字仿真人（入口「3D 数字仿真人演示」，白底新形象，三态均为重导高清视频）
  sim: {
    dir: 'avatar-sim/',
    files: { idle: 'idle', intro: 'intro', speaking: 'speaking' },
  },
}
