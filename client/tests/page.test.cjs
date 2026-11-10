const assert=require('node:assert/strict');
let definition,modal,chooseOptions,lastToast,copyListener,copyOff,menus;
global.Page=d=>definition=d;
global.wx={showToast(o){lastToast=o.title;},showModal(o){assert.ok(!o.confirmText||Array.from(o.confirmText).length<=4);modal=o;},chooseMedia(o){chooseOptions=o;},showShareMenu(o){menus=o.menus;},onCopyUrl(fn){copyListener=fn;},offCopyUrl(fn){copyOff=fn;}};
const config=require('../miniprogram/config');config.cloudEnv='';config.recognitionUrl='';
const api=require('../miniprogram/services/recognition');const actualUpload=api.upload;api.warmup=()=>Promise.resolve(false);
require('../miniprogram/pages/index/index');
const event=dataset=>({currentTarget:{dataset}});const flush=()=>new Promise(r=>setImmediate(r));
function page(){const p={...definition,data:structuredClone(definition.data),setData(next){Object.assign(this.data,next);}};p.onLoad();return p;}
function example(p,mode='waits'){p.example(event({mode}));}
function add13(p){for(const n of '3344455667789')p.chooseTile(event({id:Number(n)+8}));}
(async()=>{
 const p=page();p.openPicker(event({}));add13(p);
 assert.equal(p.hand.tiles.length,0,'draft edits do not change committed hand');assert.equal(p.data.pickerCanConfirm,true);assert.equal(p.data.isEmpty,true);
 p.confirmPicker();assert.equal(p.hand.tiles.length,13);assert.deepEqual(p.data.waits.map(w=>w.id),[11,12,15]);
 p.openPicker(event({}));p.removePickerTile(event({index:2}));assert.equal(p.pickerDraft.tiles.length,12);assert.equal(p.hand.tiles.length,13);assert.equal(p.data.pickerCanConfirm,false);
 assert.match(p.data.pickerStatus,/还差 1 张/);p.confirmPicker();assert.equal(p.data.picker,true);p.undoPicker();assert.equal(p.pickerDraft.tiles.length,13);assert.equal(p.data.canPickerUndo,false);
 p.removePickerTile(event({index:2}));p.closePicker();assert.equal(p.hand.tiles.length,13,'close discards deletion');
 p.openPicker(event({}));const original=p.pickerDraft.tiles.slice();p.removePickerTile(event({index:-1}));p.removePickerTile(event({index:99}));assert.deepEqual(p.pickerDraft.tiles,original);
 p.removePickerTile(event({index:2}));p.chooseTile(event({id:12}));p.confirmPicker();assert.equal(p.hand.tiles.length,13);
 const repeated=page();repeated.openPicker(event({}));for(let i=0;i<4;i++)repeated.chooseTile(event({id:18}));
 const history=repeated.pickerHistory.length;repeated.chooseTile(event({id:18}));assert.equal(repeated.pickerDraft.tiles.length,4);assert.equal(repeated.pickerHistory.length,history);
 assert.equal(repeated.data.palette[2].tiles[0].disabled,true);repeated.undoPicker();assert.equal(repeated.data.palette[2].tiles[0].disabled,false);
 repeated.closePicker();repeated.openPicker(event({}));assert.equal(repeated.data.canPickerUndo,false,'undo cannot cross picker sessions');
 p.tapHandTile(event({index:0}));p.chooseTile(event({id:9}));assert.equal(p.hand.tiles[0],11);assert.equal(p.pickerDraft.tiles[0],9);p.closePicker();assert.equal(p.hand.tiles[0],11);
 p.tapHandTile(event({index:0}));p.chooseTile(event({id:9}));p.confirmPicker();assert.equal(p.hand.tiles[0],9);
 p.toggleDeleteMode();p.removeHandTile(event({index:99}));assert.equal(p.hand.tiles.length,13);p.tapHandTile(event({index:0}));assert.equal(p.hand.tiles.length,12);assert.equal(p.data.waits.length,0);assert.match(p.data.title,/还差 1 张/);p.toggleDeleteMode();
 p.newRound();assert.equal(p.data.deleteMode,false);
 p.openPicker(event({meld:'pong'}));p.chooseTile(event({id:0}));assert.equal(p.hand.melds.length,0);p.closePicker();assert.equal(p.hand.melds.length,0);
 p.openPicker(event({meld:'pong'}));p.chooseTile(event({id:0}));p.chooseTile(event({id:1}));assert.equal(p.pickerDraft.melds.length,1);p.confirmPicker();assert.equal(p.hand.melds[0].tile,1);assert.equal(p.data.expected,10);
 p.openPicker(event({}));p.chooseTile(event({id:1}));p.chooseTile(event({id:1}));assert.equal(p.pickerDraft.tiles.length,1);p.closePicker();
 p.changeMode(event({mode:'discards'}));assert.equal(p.data.expected,11);p.newRound();assert.equal(p.hand.sevenPairs,true);
 example(p);const beforeMode=structuredClone(p.hand);p.showGameModes();p.selectGameMode();assert.deepEqual(p.hand,beforeMode);assert.equal(p.data.gameModesOpen,false);
 p.showRules();assert.equal(p.data.rulesOpen,true);p.closeRules();p.changeQue({detail:{value:2}});assert.equal(p.data.waits.length,0);p.changeQue({detail:{value:0}});assert.equal(p.data.waits.length,3);p.toggleWait(event({index:0}));assert.equal(p.data.proofOpen,true);
 p.onShow();assert.deepEqual(menus,['shareAppMessage','shareTimeline']);assert.equal(copyListener().query,'');
 assert.deepEqual(p.onShareAppMessage(),{title:'这把胡什么｜拍手牌，查听口',path:'/pages/index/index',imageUrl:'/assets/share/friends.png'});
 assert.deepEqual(p.onShareTimeline(),{title:'这把胡什么｜拍手牌，查听口',query:'',imageUrl:'/assets/share/moments.png'});
 const listener=copyListener;p.onHide();assert.equal(copyOff,listener);p.onShow();p.onUnload();assert.equal(copyOff,copyListener);
 const q=page();chooseOptions=null;await q.choosePhoto(event({source:'camera'}));assert.equal(modal.title,'拍照识牌尚未接通');assert.equal(chooseOptions,null);
 config.cloudEnv='test';config.cloudService='test';let uploadResolve,uploadReject,uploadCalls=0,aborted=0;
 api.upload=(file,onTask,onStatus)=>{uploadCalls++;onTask({abort(){aborted++;}});onStatus({phase:'uploading'});return new Promise((res,rej)=>{uploadResolve=res;uploadReject=rej;});};
 async function start(p,source='camera'){
  const run=p.choosePhoto(event({source}));modal.success({confirm:true});await flush();assert.deepEqual(chooseOptions.sourceType,[source]);p.onHide();chooseOptions.success({tempFiles:[{tempFilePath:'/test/hand.jpg',size:1000}]});await flush();return {run};
 }
 const declined=q.choosePhoto(event({source:'album'}));modal.success({confirm:false});await declined;assert.equal(uploadCalls,0);
 const failedDisclosure=q.choosePhoto();modal.fail({errMsg:'native fail'});await failedDisclosure;assert.equal(uploadCalls,0);assert.match(lastToast,/无法打开照片确认/);
 example(q);const originalHand=structuredClone(q.hand);const scan=await start(q);assert.equal(q.data.busy,true);assert.equal(q.data.waits.length,0);assert.equal(q.data.busyText,'正在上传照片');
 uploadResolve([...'3344455667789'].map((n,i)=>({tile:Number(n)+8,confidence:i===9?.6:.99,ambiguous:false})));await scan.run;
 assert.equal(q.data.picker,true);assert.equal(q.data.pickerReview,true);assert.deepEqual(q.hand,originalHand);assert.deepEqual(q.pickerDraft.uncertain,[9]);
 q.removePickerTile(event({index:3}));assert.deepEqual(q.pickerDraft.uncertain,[8]);q.undoPicker();assert.deepEqual(q.pickerDraft.uncertain,[9]);q.closePicker();assert.deepEqual(q.hand,originalHand);
 q.changeMode(event({mode:'discards'}));const scan14=await start(q,'album');uploadResolve([...'3344455667789'].map(n=>({tile:Number(n)+8,confidence:.99})));await scan14.run;
 assert.equal(q.data.pickerCanConfirm,false);q.confirmPicker();assert.equal(q.data.picker,true);q.chooseTile(event({id:9}));q.confirmPicker();assert.equal(q.data.picker,false);assert.equal(q.hand.tiles.length,14);assert.equal(q.hand.pending,false);assert.equal(q.data.discards[0].id,9);
 const stale=await start(q);const late=uploadResolve;q.newRound();assert.ok(aborted);late([{tile:2,confidence:.9}]);await stale.run;assert.equal(q.hand.tiles.length,0);assert.equal(q.data.picker,false);
 example(q);const preserved=structuredClone(q.hand);const bad=await start(q);uploadReject(Error('识牌服务暂时未响应，请稍后重试，或手动选牌'));await bad.run;assert.deepEqual(q.hand,preserved);assert.equal(q.data.waits.length,3);assert.equal(q.data.busy,false);assert.match(lastToast,/识牌服务暂时未响应/);
 const cancelled=await start(q);const resolveCancelled=uploadResolve;q.cancelRecognition();resolveCancelled([{tile:0,confidence:.9}]);await cancelled.run;assert.deepEqual(q.hand,preserved);
 const invalid=await start(q);uploadResolve(Array.from({length:13},(_,i)=>({tile:i<5?0:i,confidence:.99})));await invalid.run;assert.equal(q.data.pickerCanConfirm,false);assert.match(q.data.pickerError,/超过了四张/);q.closePicker();api.upload=actualUpload;
 console.log('PASS: draft commit/cancel, exact deletion, local undo, replacement, counts, melds, default seven pairs, share privacy, photo review, stale responses and recovery');
})().catch(e=>{console.error(e);process.exitCode=1;});
