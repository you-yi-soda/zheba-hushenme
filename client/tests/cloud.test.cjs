const assert=require('node:assert/strict');
const config=require('../miniprogram/config');
const api=require('../miniprogram/services/recognition');
config.recognitionProvider='cloud';config.cloudEnv='test-env';config.cloudService='test-service';
let files=[],deleted=[],calls=[],upload,container;
global.wx={cloud:{
 uploadFile(o){upload=o;files.push(o.cloudPath);return {abort(){}};},
 getTempFileURL(o){o.success({fileList:[{status:0,tempFileURL:'https://bucket.cos.ap-shanghai.myqcloud.com/recognition/test.jpg'}]});},
 callContainer(o){container=o;calls.push(o);},
 deleteFile(o){deleted.push(...o.fileList);}
}};
const flush=()=>new Promise(r=>setImmediate(r));
(async()=>{
 assert.equal(api.configured(),true);
 let task;let p=api.upload('/test/a.jpg',t=>task=t);
 upload.success({fileID:'cloud://file1'});await flush();
 assert.equal(container.path,'/recognize-url');assert.equal(container.header['X-WX-SERVICE'],'test-service');
 assert.deepEqual(Object.keys(container.data),['url'],'container must not carry large image data');
 container.success({statusCode:200,data:{detections:[{tile:2,confidence:.6,ambiguous:true}]}});
 assert.deepEqual(await p,[{tile:2,confidence:.6,ambiguous:true}]);assert.deepEqual(deleted,['cloud://file1']);
 p=api.upload('/test/b.jpg',t=>task=t);task.abort();upload.success({fileID:'cloud://cancelled'});
 await assert.rejects(p,/cancel/);assert.ok(deleted.includes('cloud://cancelled'));assert.equal(calls.length,1);
 p=api.upload('/test/c.jpg',t=>task=t);upload.success({fileID:'cloud://failure'});await flush();
 container.success({statusCode:422,data:{error:{code:'NO_ROW',message:'没有找到手牌'}}});
 await assert.rejects(p,/没有找到手牌/);assert.ok(deleted.includes('cloud://failure'));
 p=api.upload('/test/d.jpg',t=>task=t);upload.success({fileID:'cloud://stale'});await flush();task.abort();
 container.success({statusCode:200,data:{detections:[{tile:2,confidence:.9}]}});
 await assert.rejects(p,/cancel/);assert.ok(deleted.includes('cloud://stale'));
 assert.throws(()=>api.parseResponse({statusCode:200,data:{detections:Array(15).fill({tile:2,confidence:.9})}}));
 console.log('PASS: cloud upload, short URL request, cleanup, cancellation, errors and late response');
})().catch(e=>{console.error(e);process.exitCode=1;});
