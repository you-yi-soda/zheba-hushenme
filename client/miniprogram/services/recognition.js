const config = require('../config');
const UNAVAILABLE = '识牌服务暂时未响应，请稍后重试，或手动选牌';
function failure(message, code, retryable = false) {
  return Object.assign(Error(message), {code, retryable});
}
function configured() {
  return config.recognitionProvider === 'cloud'
    ? !!(config.cloudEnv && config.cloudService)
    : /^https:\/\//.test(config.recognitionUrl);
}
function parseResponse(response) {
  const status = response.statusCode;
  let data = response.data;
  try { if (typeof data === 'string') data = JSON.parse(data); } catch (_) { data = null; }
  if (status !== 200) {
    const code = data && data.error && data.error.code;
    const messages = {401:'请重新打开小程序再试',413:'照片超过 10 MB，请压缩后重试',429:'识牌太频繁，请稍后再试'};
    if (['INVALID_IMAGE','NO_ROW','NO_TILES','UNSUPPORTED','PHOTO_EXPIRED','EMPTY','MISSING_FILE'].includes(code)) {
      throw failure('照片未能识别，请重拍或手动选牌', code);
    }
    if (['STORAGE_CONFIG','INVALID_URL','MISSING_URL','BAD_REQUEST','UNAUTHORIZED'].includes(code)) {
      throw failure('识牌服务配置异常，请稍后再试或手动选牌', code);
    }
    throw failure(messages[status] || UNAVAILABLE, code || `HTTP_${status}`, [500,502,503,504].includes(status));
  }
  if (!data || !Array.isArray(data.detections) || data.detections.length < 1 || data.detections.length > 14) {
    throw failure('没有识别到完整手牌，请重拍或手动选牌', 'NO_TILES');
  }
  if (data.unsupported) throw failure('有牌未认清或含非川麻牌，请重拍或手动选牌', 'UNSUPPORTED');
  return data.detections.map(d => {
    if (!d || !Number.isInteger(d.tile) || d.tile < 0 || d.tile > 26 || !Number.isFinite(d.confidence) || d.confidence < 0 || d.confidence > 1) {
      throw failure('识牌结果格式有误，请重拍或手动选牌', 'INVALID_RESULT');
    }
    return {tile:d.tile, confidence:d.confidence, ambiguous:d.ambiguous === true};
  });
}
function transportError(error) {
  if (error && typeof error.retryable === 'boolean') return error;
  const raw = String(error && (error.errMsg || error.message) || '');
  if (/cancel|abort/i.test(raw)) return failure('cancel', 'CANCELLED');
  if (/auth|permission|denied|invalid|not.?found|not.?support|not a function/i.test(raw)) {
    return failure('识牌暂不可用，请重新进入小程序或手动选牌', 'UNAVAILABLE');
  }
  const transient = /timeout|timed.?out|network|socket|connect|网络|超时/i.test(raw) || Number(error && error.errCode) === 102002;
  return failure(transient ? UNAVAILABLE : '照片识别未完成，请稍后再试或手动选牌', 'TRANSPORT', transient);
}
function context(onTask, onStatus) {
  const ctx = {cancelled:false, current:null, reject:null};
  ctx.check = () => { if (ctx.cancelled) throw failure('cancel', 'CANCELLED'); };
  ctx.status = (phase, attempt = 0) => { if (!ctx.cancelled && onStatus) onStatus({phase, attempt}); };
  ctx.abort = () => {
    if (ctx.cancelled) return;
    ctx.cancelled = true;
    if (ctx.reject) ctx.reject(failure('cancel', 'CANCELLED'));
    try { if (ctx.current && ctx.current.abort) ctx.current.abort(); } catch (_) {}
  };
  if (onTask) onTask({abort:ctx.abort});
  return ctx;
}
// Own deadline also covers SDK versions whose container promise has no abort().
function invoke(ctx, start, timeout, onSuccess, slow) {
  ctx.check();
  return new Promise((resolve, reject) => {
    let done = false, timer, slowTimer;
    const finish = (error, value) => {
      if (done) return;
      done = true; clearTimeout(timer); clearTimeout(slowTimer);
      ctx.reject = null;
      error ? reject(error) : resolve(value);
    };
    ctx.reject = error => finish(error);
    timer = setTimeout(() => {
      finish(failure(UNAVAILABLE, 'TIMEOUT', true));
      try { if (ctx.current && ctx.current.abort) ctx.current.abort(); } catch (_) {}
    }, timeout);
    if (slow) slowTimer = setTimeout(slow, Math.min(8000, timeout));
    const success = value => {
      if (onSuccess) onSuccess(value, done || ctx.cancelled);
      if (ctx.cancelled) finish(failure('cancel', 'CANCELLED'));
      else finish(null, value);
    };
    try {
      ctx.current = start({success, fail:error => finish(transportError(error))});
      if (ctx.current && typeof ctx.current.catch === 'function') ctx.current.catch(() => {});
    } catch (error) { finish(transportError(error)); }
  });
}
function delay(ctx, ms) {
  ctx.check();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ctx.reject = null; resolve(); }, ms);
    ctx.reject = error => { clearTimeout(timer); ctx.reject = null; reject(error); };
  });
}
function timeoutMs() {
  const n = Number(config.recognitionTimeoutMs);
  return Number.isFinite(n) ? Math.max(1, Math.min(n, 15000)) : 15000;
}
async function recognize(ctx, request) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    ctx.check(); ctx.status('recognizing', attempt);
    try {
      const response = await invoke(ctx, request, timeoutMs(), null, () => ctx.status('waiting', attempt));
      ctx.check(); return parseResponse(response);
    } catch (error) {
      ctx.check();
      if (attempt === 2 || !error.retryable) throw error;
      ctx.status('retrying', attempt);
      await delay(ctx, Math.max(0, Number(config.recognitionRetryDelayMs) || 0));
    }
  }
}
async function cloudUpload(filePath, ctx) {
  if (!wx.cloud || typeof wx.cloud.callContainer !== 'function') throw failure('微信版本过低，请升级微信或手动选牌', 'SDK');
  let fileID = '';
  const deleted = new Set();
  const cleanup = id => {
    if (!id || deleted.has(id)) return;
    deleted.add(id);
    try {
      const task = wx.cloud.deleteFile({fileList:[id],config:{env:config.cloudEnv},fail(){}});
      if (task && task.catch) task.catch(() => {});
    } catch (_) {}
  };
  try {
    ctx.status('uploading');
    const ext = /\.png$/i.test(filePath) ? 'png' : /\.webp$/i.test(filePath) ? 'webp' : 'jpg';
    const cloudPath = `recognition/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const result = await invoke(ctx, cb => wx.cloud.uploadFile({cloudPath,filePath,config:{env:config.cloudEnv},...cb}), 60000,
      (value, late) => { if (late && value.fileID) cleanup(value.fileID); });
    fileID = result.fileID; ctx.check();
    if (!fileID) throw failure('照片上传失败，请重试', 'UPLOAD');
    const temporary = await invoke(ctx, cb => wx.cloud.getTempFileURL({fileList:[fileID],config:{env:config.cloudEnv},...cb}), 15000);
    ctx.check();
    const entry = temporary.fileList && temporary.fileList[0];
    if (!entry || entry.status !== 0 || !entry.tempFileURL) throw failure('照片上传失败，请重试', 'UPLOAD');
    return await recognize(ctx, cb => wx.cloud.callContainer({
      config:{env:config.cloudEnv},path:'/recognize-url',method:'POST',
      header:{'X-WX-SERVICE':config.cloudService,'content-type':'application/json'},
      data:{url:entry.tempFileURL},timeout:timeoutMs(),...cb
    }));
  } finally { cleanup(fileID); }
}
async function upload(filePath, onTask, onStatus) {
  if (!configured()) throw failure('拍照识牌尚未接通，请先手动选牌', 'CONFIG');
  const ctx = context(onTask, onStatus);
  try {
    ctx.check();
    if (config.recognitionProvider === 'cloud') return await cloudUpload(filePath, ctx);
    return await recognize(ctx, cb => wx.uploadFile({url:config.recognitionUrl,filePath,name:'file',timeout:timeoutMs(),...cb}));
  } catch (error) { ctx.check(); throw transportError(error); }
}
// One lightweight call per page creation; no photos, polling or automatic retry.
function warmup(onTask) {
  if (!configured() || config.recognitionProvider !== 'cloud' || !wx.cloud || !wx.cloud.callContainer) return Promise.resolve(false);
  const ctx = context(onTask);
  return invoke(ctx, cb => wx.cloud.callContainer({config:{env:config.cloudEnv},path:'/healthz',method:'GET',
    header:{'X-WX-SERVICE':config.cloudService},timeout:timeoutMs(),...cb}), timeoutMs())
    .then(response => response.statusCode === 200).catch(() => false);
}
module.exports = {configured, upload, parseResponse, warmup};
