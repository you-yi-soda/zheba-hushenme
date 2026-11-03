const config = require('../config');
function configured() {
  return config.recognitionProvider === 'cloud'
    ? !!(config.cloudEnv && config.cloudService)
    : /^https:\/\//.test(config.recognitionUrl);
}
function parseResponse(response) {
  const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  if (response.statusCode !== 200) {
    const messages={401:'请重新打开小程序再试',413:'照片超过 10 MB，请压缩后重试',429:'识牌太频繁，请稍后再试',503:'识牌服务忙，请稍后重试'};
    throw Error(data && data.error && typeof data.error.message==='string'
      ? data.error.message : messages[response.statusCode] || '识牌服务暂时不可用，请重试');
  }
  if (!data || !Array.isArray(data.detections) || data.detections.length < 1 || data.detections.length > 14) throw Error('没有识别到手牌，请重拍或手动选牌');
  if (data.unsupported) throw Error('有牌未认清或含非川麻牌，请重拍或手动选牌');
  return data.detections.map(d => {
    if (!d || !Number.isInteger(d.tile) || d.tile < 0 || d.tile > 26 || !Number.isFinite(d.confidence) || d.confidence < 0 || d.confidence > 1) throw Error('识牌结果格式有误，请重试');
    return {tile:d.tile,confidence:d.confidence,ambiguous:d.ambiguous === true};
  });
}
// callContainer carries only a short-lived URL. Images go through private cloud storage.
async function cloudUpload(filePath,onTask) {
  if(!wx.cloud)throw Error('微信版本过低，请升级微信或手动选牌');
  let cancelled=false,current=null,fileID='';
  const task={abort(){cancelled=true;if(current&&current.abort)current.abort();}};
  if(onTask)onTask(task);
  const check=()=>{if(cancelled)throw Error('cancel');};
  const invoke=(method,options)=>new Promise((resolve,reject)=>{
    current=wx.cloud[method]({...options,success:resolve,fail:reject});
  });
  try {
    const extension=/\.png$/i.test(filePath)?'png':/\.webp$/i.test(filePath)?'webp':'jpg';
    const cloudPath=`recognition/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
    const result=await invoke('uploadFile',{cloudPath,filePath,config:{env:config.cloudEnv}});
    fileID=result.fileID;check();
    if(!fileID)throw Error('照片上传失败，请重试');
    const temporary=await invoke('getTempFileURL',{fileList:[fileID],config:{env:config.cloudEnv}});check();
    const entry=temporary.fileList&&temporary.fileList[0];
    if(!entry||entry.status!==0||!entry.tempFileURL)throw Error('照片上传失败，请重试');
    const response=await invoke('callContainer',{config:{env:config.cloudEnv},path:'/recognize-url',method:'POST',
      header:{'X-WX-SERVICE':config.cloudService,'content-type':'application/json'},
      data:{url:entry.tempFileURL},timeout:config.recognitionTimeoutMs});check();
    return parseResponse(response);
  } catch(e) {
    if(cancelled)throw Error('cancel');
    if(e.message)throw e;
    throw Error('照片识别未完成，请检查网络或手动选牌');
  } finally {
    if(fileID)wx.cloud.deleteFile({fileList:[fileID],config:{env:config.cloudEnv},fail(){}});
  }
}
function upload(filePath, onTask) {
  if(!configured())return Promise.reject(Error('拍照识牌尚未接通，请先手动选牌'));
  if(config.recognitionProvider==='cloud')return cloudUpload(filePath,onTask);
  return new Promise((resolve,reject) => {
    const task = wx.uploadFile({url:config.recognitionUrl,filePath,name:'file',timeout:config.recognitionTimeoutMs,
      success(res) {try {resolve(parseResponse(res));} catch(e) {reject(e);}},
      fail() {reject(Error('照片上传未完成，请检查网络或手动选牌'));}
    });
    if (onTask) onTask(task);
  });
}
module.exports={configured,upload,parseResponse};
