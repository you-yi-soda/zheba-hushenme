const SUITS=['万','筒','条'];
const tileName=id=>`${id%9+1}${SUITS[Math.floor(id/9)]}`;
function countsOf(tiles){const c=Array(27).fill(0);for(const t of tiles){if(!Number.isInteger(t)||t<0||t>26)throw Error('存在无法识别的牌');c[t]++;}return c;}
function splitMelds(c){
 const i=c.findIndex(x=>x>0);if(i<0)return [];
 if(c[i]>=3){c[i]-=3;const r=splitMelds(c);c[i]+=3;if(r)return [[i,i,i],...r];}
 if(i%9<=6&&c[i+1]&&c[i+2]){c[i]--;c[i+1]--;c[i+2]--;const r=splitMelds(c);c[i]++;c[i+1]++;c[i+2]++;if(r)return [[i,i+1,i+2],...r];}
 return null;
}
function winning(c,meldCount=0,sevenPairs=true){
 if(c.length!==27||c.some(n=>!Number.isInteger(n)||n<0||n>4)||c.reduce((a,b)=>a+b,0)!==14-meldCount*3)return null;
 if(meldCount===0&&sevenPairs&&c.every(n=>n%2===0)){const groups=[];c.forEach((n,i)=>{for(let k=0;k<n/2;k++)groups.push([i,i]);});return {type:'七对',groups};}
 for(let p=0;p<27;p++){if(c[p]<2)continue;c[p]-=2;const r=splitMelds(c);c[p]+=2;if(r)return {type:'普通胡',groups:[[p,p],...r]};}
 return null;
}
function validate(tiles,opts={}){
 const melds=opts.melds||[];if(melds.length>4)throw Error('碰杠不能超过四组');
 const c=countsOf(tiles),known=c.slice();
 for(const m of melds){if(!['pong','kong'].includes(m.type)||!Number.isInteger(m.tile)||m.tile<0||m.tile>26)throw Error('请检查碰杠记录');known[m.tile]+=m.type==='kong'?4:3;}
 if(known.some(n=>n>4))throw Error('同一种牌超过了四张，请检查手牌和碰杠');
 if(opts.que!=null&&(!Number.isInteger(opts.que)||opts.que<0||opts.que>2))throw Error('请选择正确的定缺花色');
 if(melds.some(m=>Math.floor(m.tile/9)===opts.que))throw Error('碰杠中有定缺花色，请检查本局定缺');
 return {c,known,melds};
}
function waits(tiles,opts={}){
 const {c,known,melds}=validate(tiles,opts);
 if(tiles.length!==13-3*melds.length)throw Error(`查听口需要 ${13-3*melds.length} 张手牌，当前 ${tiles.length} 张`);
 if(opts.que!=null&&tiles.some(t=>Math.floor(t/9)===opts.que))return [];
 const out=[];
 for(let t=0;t<27;t++){
  if(known[t]>=4||Math.floor(t/9)===opts.que)continue;
  c[t]++;const win=winning(c,melds.length,opts.sevenPairs!==false);c[t]--;
  if(win)out.push({tile:t,unseen:4-known[t],...win});
 }
 return out;
}
function analyze(tiles,opts={}){
 const {c,melds}=validate(tiles,opts),base=13-3*melds.length;
 if(![base,base+1].includes(tiles.length))return {kind:'incomplete',needed:base,neededDiscard:base+1};
 if(tiles.length===base)return {kind:'waits',waits:waits(tiles,opts),hasQue:opts.que!=null&&tiles.some(t=>Math.floor(t/9)===opts.que)};
 const hasQue=opts.que!=null&&tiles.some(t=>Math.floor(t/9)===opts.que);
 const win=hasQue?null:winning(c,melds.length,opts.sevenPairs!==false);
 const discards=[];
 for(const t of [...new Set(tiles)]){
  if(hasQue&&Math.floor(t/9)!==opts.que)continue;
  const next=tiles.slice();next.splice(next.indexOf(t),1);const w=waits(next,opts);
  // The discarded tile is also known, even when it is a future waiting tile.
  const adjusted=w.map(x=>({...x,unseen:x.unseen-(x.tile===t?1:0)})).filter(x=>x.unseen>0);
  if(adjusted.length)discards.push({tile:t,waits:adjusted,unseen:adjusted.reduce((a,x)=>a+x.unseen,0)});
 }
 discards.sort((a,b)=>b.unseen-a.unseen||b.waits.length-a.waits.length||a.tile-b.tile);
 return {kind:'discards',win,discards,hasQue};
}

module.exports={SUITS,tileName,countsOf,winning,validate,waits,analyze};
