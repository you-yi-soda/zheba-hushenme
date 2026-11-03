// 部署后填微信云托管环境 ID 和服务名。这里不放任何密钥。
// 留空时手动功能正常，照片入口明确提示未接通。
module.exports = {
  sourceCodeUrl: "https://github.com/you-yi-soda/zheba-hushenme", // 公开源码地址；确认公开并验证可访问后再填写
  recognitionProvider: 'cloud',
  cloudEnv: '',
  cloudService: 'mahjong-recognition',
  recognitionUrl: '', // 仅 recognitionProvider='https' 时使用
  recognitionTimeoutMs: 60000
};
