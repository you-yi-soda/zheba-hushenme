const config=require('./config');
App({onLaunch(){
  if(config.recognitionProvider==='cloud'&&config.cloudEnv&&wx.cloud){
    wx.cloud.init({env:config.cloudEnv,traceUser:false});
  }
}});
