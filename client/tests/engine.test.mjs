import assert from 'node:assert/strict';
import engine from '../miniprogram/utils/engine.js';
const {winning,waits,analyze,countsOf}=engine;
const hand=s=>[...s].map(n=>+n-1);
assert.deepEqual(waits(hand('3344455667789'),{que:1}).map(w=>w.tile),[2,3,6]);
assert.equal(waits(hand('3344455667789'),{que:0}).length,0);
assert.equal(winning(countsOf(hand('11223344556677'))).type,'七对');
assert.equal(winning(countsOf(hand('11112233445566'))).type,'七对');
assert.equal(winning(countsOf(hand('11112233445566')),0,false)?.type,'普通胡');
assert.throws(()=>waits(hand('1111123456789')),/四张/);
assert.throws(()=>waits(hand('3344455667789'),{melds:[{tile:3,type:'pong'}]}),/四张/);
assert.equal(waits([0],{melds:[{tile:1,type:'kong'},{tile:2,type:'pong'},{tile:3,type:'pong'},{tile:4,type:'pong'}],que:1})[0].tile,0);
assert.equal(analyze(hand('13344455667789'),{que:1}).discards.some(d=>d.tile===0),true);
assert.equal(analyze(hand('33444556677899'),{que:0}).discards.length,0);
assert.ok(!analyze(hand('11112345677789')).discards.find(d=>d.tile===0)?.waits.some(w=>w.tile===0),'discarded fourth copy cannot become an available fifth copy');
// A structurally possible fifth physical tile must never be offered.
const testMelds=[{tile:0,type:'pong'},{tile:4,type:'pong'},{tile:8,type:'pong'}];
assert.deepEqual(waits([0,1,2,3],{melds:testMelds}).map(w=>w.tile),[3]);
// Independent oracle: construct every legal complete single-suit hand from
// combinations of four melds and a pair. This does not reuse the solver.
const oracle=new Set(),patterns=[];
for(let i=0;i<9;i++)patterns.push([i,i,i]);
for(let i=0;i<7;i++)patterns.push([i,i+1,i+2]);
function construct(c,from,depth){if(depth===4){for(let p=0;p<9;p++){if(c[p]>2)continue;c[p]+=2;oracle.add(c.join(''));c[p]-=2;}return;}
 for(let j=from;j<patterns.length;j++){const pat=patterns[j];for(const i of pat)c[i]++;if(c.every(n=>n<=4))construct(c,j,depth+1);for(const i of pat)c[i]--;}}
construct(Array(9).fill(0),0,0);
function seven(c,i,left){if(i===9){if(!left)oracle.add(c.join(''));return;}for(let n=0;n<=4&&n<=left;n+=2){c[i]=n;seven(c,i+1,left-n);}c[i]=0;}seven(Array(9).fill(0),0,14);
let checked=0;const begin=performance.now();
function visit(c,i,left){if(i===9){if(left)return;const full=[...c,...Array(18).fill(0)],key=c.join('');const answer=winning(full);assert.equal(!!answer,oracle.has(key),`single-suit ${key}`);assert.deepEqual(full.slice(0,9),c,'solver changed input');if(answer){const flat=countsOf(answer.groups.flat());assert.deepEqual(flat,full,'incorrect proof');}checked++;return;}for(let n=0;n<=4&&n<=left;n++){c[i]=n;visit(c,i+1,left-n);}c[i]=0;}
visit(Array(9).fill(0),0,14);
// Mixed suits, exposed groups and seven-pairs-disabled must preserve proof.
let seed=1337;const rnd=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};let generated=0;
for(let k=0;k<1500;k++){const c=Array(27).fill(0),pair=rnd(27);c[pair]=2;for(let m=0;m<4;m++){const start=rnd(27);if(rnd(2)){c[start]+=3;}else{const t=Math.floor(start/9)*9+rnd(7);c[t]++;c[t+1]++;c[t+2]++;}}if(c.some(n=>n>4))continue;const w=winning(c,0,false);assert.ok(w);assert.deepEqual(countsOf(w.groups.flat()),c);const present=c.flatMap((n,i)=>Array(n).fill(i));const removed=present.splice(rnd(14),1)[0];assert.ok(waits(present,{sevenPairs:false}).some(x=>x.tile===removed));generated++;}
console.log(JSON.stringify({singleSuitHands:checked,constructedWinningHands:oracle.size,mixedSuitHands:generated,elapsedMs:Math.round(performance.now()-begin),result:'PASS'}));
