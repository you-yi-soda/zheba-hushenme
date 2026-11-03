const assert=require('node:assert/strict');
const fs=require('node:fs');
const response=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const recognition=require('../miniprogram/services/recognition');
let definition;global.Page=d=>definition=d;global.wx={showToast(){}};
require('../miniprogram/pages/index/index');
const p={...definition,data:structuredClone(definition.data),setData(v){Object.assign(this.data,v)}};p.onLoad();
const found=recognition.parseResponse({statusCode:response.http_status,data:response.response});
p.hand.tiles=found.map(d=>d.tile);p.hand.pending=true;p.hand.uncertain=found.flatMap((d,i)=>d.ambiguous||d.confidence<.85?[i]:[]);p.refresh();
assert.equal(p.data.waits.length,0,'unconfirmed real result cannot calculate');
for(const index of [8,10]){p.openPicker({currentTarget:{dataset:{index}}});p.chooseTile({currentTarget:{dataset:{id:6}}});}
assert.equal(p.data.pending,true,'manual correction retains review gate');
p.confirm();assert.equal(p.data.pending,false);assert.equal(p.data.error,'');
assert.deepEqual(p.hand.tiles,[2,2,3,3,3,4,4,5,6,5,6,7,8]);
console.log('PASS: real YOLO response -> review -> correct two tiles -> confirm -> local calculation');
