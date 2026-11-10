const assert=require('node:assert/strict'),fs=require('node:fs');
if(!process.argv[2])throw Error('请提供已保存的识牌服务JSON响应路径');
const response=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const recognition=require('../miniprogram/services/recognition');recognition.warmup=()=>Promise.resolve(false);
let definition;global.Page=d=>definition=d;global.wx={showToast(){}};
require('../miniprogram/pages/index/index');
const p={...definition,data:structuredClone(definition.data),setData(v){Object.assign(this.data,v)}};p.onLoad();
const found=recognition.parseResponse({statusCode:response.http_status,data:response.response});
const draft=structuredClone(p.hand);draft.tiles=found.map(d=>d.tile);draft.pending=true;
draft.uncertain=found.flatMap((d,i)=>d.ambiguous||d.confidence<.85?[i]:[]);p.startDraft(draft);
assert.equal(p.hand.tiles.length,0,'real response stays in a draft');assert.equal(p.data.waits.length,0);
// Correct the two known wrong tiles while preserving their original order.
for(const index of [8,10]){p.pickIndex=index;p.chooseTile({currentTarget:{dataset:{id:6}}});}
assert.equal(p.data.pickerReview,true);assert.equal(p.hand.tiles.length,0);
p.confirmPicker();assert.equal(p.data.picker,false);assert.equal(p.hand.pending,false);assert.equal(p.data.error,'');
assert.deepEqual(p.hand.tiles,[2,2,3,3,3,4,4,5,6,5,6,7,8]);
console.log('PASS: saved real YOLO response -> draft review -> two corrections -> commit -> local calculation');
