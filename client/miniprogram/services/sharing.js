const TITLE = '这把胡什么｜拍手牌，查听口';
function appMessage() { return {title:TITLE,path:'/pages/index/index',imageUrl:'/assets/share/friends.png'}; }
function timeline() { return {title:TITLE,query:'',imageUrl:'/assets/share/moments.png'}; }
function bind() {
  if (wx.showShareMenu) wx.showShareMenu({menus:['shareAppMessage','shareTimeline'],fail(){}});
  // Customizes WeChat's native Copy URL entry; does not manufacture a URL.
  const listener = () => ({query:'',title:'拍手牌，查听口'});
  if (wx.onCopyUrl) wx.onCopyUrl(listener);
  return listener;
}
function unbind(listener) { if (listener && wx.offCopyUrl) wx.offCopyUrl(listener); }
module.exports = {appMessage,timeline,bind,unbind};
