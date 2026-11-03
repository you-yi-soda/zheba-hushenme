const config = require('../config');
function validUrl(value) {
  return typeof value === 'string' && /^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::443)?(?:[/?#][^\s]*)?$/i.test(value);
}
function show() {
  const url = config.sourceCodeUrl;
  if (!validUrl(url)) {
    wx.showModal({title:'源码地址待配置',content:'此候选版尚未配置公开源码地址，请联系运营者。',showCancel:false});
    return;
  }
  wx.showModal({
    title:'开源与许可',
    content:'本项目按 AGPL-3.0 提供源码，第三方组件保留各自许可。可获取小程序、识牌服务、模型及构建说明。\n\n'+url,
    confirmText:'复制地址',cancelText:'关闭',
    success(result){if(result.confirm)wx.setClipboardData({data:url});}
  });
}
module.exports = {show, validUrl};
