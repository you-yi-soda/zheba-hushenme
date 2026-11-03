const engine = require('../../utils/engine');
const recognition = require('../../services/recognition');
const sourceOffer = require('../../services/source-offer');
const copy = obj => JSON.parse(JSON.stringify(obj));
const blank = () => ({tiles:[],melds:[],que:null,sevenPairs:true,mode:'waits',pending:false,uncertain:[],photo:''});
const face = id => ({id,number:id%9+1,suit:engine.SUITS[Math.floor(id/9)],name:engine.tileName(id),suitClass:'suit'+Math.floor(id/9),image:`/assets/tiles/${id}.png`});
const proof = groups => groups.map(g=>g.map(engine.tileName).join(' ')).join(' ｜ ');
const waitView = w => ({...face(w.tile),unseen:w.unseen,type:w.type,proof:proof(w.groups)});
Page({
  data:{ready:false,picker:false,rulesOpen:false,busy:false,deleteMode:false,proofOpen:false,canPickerUndo:false,sampleTiles:[2,3,4,5,6,7,8].map(face),queOptions:['未设置','缺万','缺筒','缺条']},
  onLoad(){this.hand=blank();this.history=[];this.operation=0;this.refresh();},
  onHide(){if(this.uploadTask){this.cancelScan();this.refresh();}},
  onUnload(){this.cancelScan();},
  notify(message){wx.showToast({title:message,icon:'none',duration:2600});},
  save(){this.history.push(copy(this.hand));if(this.history.length>30)this.history.shift();},
  cancelScan(){this.operation=(this.operation||0)+1;if(this.uploadTask)this.uploadTask.abort();this.uploadTask=null;this.setData({busy:false});},
  refresh(){
    const h=this.hand,expected=13-h.melds.length*3+(h.mode==='discards'?1:0);
    const known=engine.countsOf(h.tiles);h.melds.forEach(m=>known[m.tile]+=m.type==='kong'?4:3);
    const palette=engine.SUITS.map((s,j)=>({suit:s,tiles:Array.from({length:9},(_,i)=>{
      const id=j*9+i,used=known[id]-(this.pickIndex!=null&&h.tiles[this.pickIndex]===id?1:0);
      return {...face(id),used:known[id],disabled:used+(this.pickMeld==='kong'?4:this.pickMeld==='pong'?3:1)>4};
    })}));
    let title='选好手牌，听口马上清楚',note=`当前查询需要 ${expected} 张手牌`,waits=[],discards=[],winProof='',error='';
    const begin=Date.now();
    if(h.pending){title='先核对，再查听口';note='请逐张核对识别结果；黄色框需要特别留意。';}
    else if(!h.tiles.length){title='听哪张，马上心里有数';note='13 张查听口 · 14 张查打哪张能听';}
    else if(h.tiles.length!==expected){title=h.tiles.length<expected?`还差 ${expected-h.tiles.length} 张手牌`:`多了 ${h.tiles.length-expected} 张手牌`;}
    else try{
      const result=engine.analyze(h.tiles,h);
      if(result.kind==='waits'){
        waits=result.waits.map(waitView);title=waits.length?`听 ${waits.length} 种牌`:result.hasQue?'先打完定缺牌':'这手暂时还没听';
        note=waits.length?'点听口，查看拆牌依据':'当前规则下没有补一张就能胡的牌。';
      }else if(result.win){title='这手牌型已成胡';winProof=proof(result.win.groups);note=result.win.type+' · 实际能否胡还需符合本桌规则';}
      else {discards=result.discards.map(d=>({...face(d.tile),unseen:d.unseen,waitText:d.waits.map(w=>engine.tileName(w.tile)).join('、'),waits:d.waits.map(waitView)}));title=discards.length?'这样打，就能听':'暂时不能一打即听';note=result.hasQue?'优先打完定缺牌':'按未见张数排序，不代表整局最优打法';}
    }catch(e){title='请检查牌面';error=e.message;}
    this.setData({ready:true,mode:h.mode,expected,tiles:h.tiles.map((t,i)=>({...face(t),index:i,uncertain:h.uncertain.includes(i)})),
      melds:h.melds.map((m,i)=>({...face(m.tile),index:i,typeLabel:m.type==='kong'?'杠':'碰'})),palette,
      pending:h.pending,photo:h.photo,queIndex:h.que==null?0:h.que+1,sevenPairs:h.sevenPairs,canUndo:!!this.history.length,canPickerUndo:!!(this.pickerHistory&&this.pickerHistory.length),
      title,note,error,waits,discards,winProof,isEmpty:!h.tiles.length&&!h.pending,elapsed:Date.now()-begin,expandedWait:-1,expandedDiscard:-1,proofOpen:false,deleteMode:!!h.tiles.length&&this.data.deleteMode,
      pickerTitle:this.pickMeld?(this.pickMeld==='kong'?'记录杠牌':'记录碰牌'):this.pickIndex!=null?'修改手牌':'添加手牌',canDelete:this.pickIndex!=null,recognitionReady:recognition.configured()});
  },
  changeMode(e){this.save();this.cancelScan();this.hand.mode=e.currentTarget.dataset.mode;this.refresh();},
  showSource(){sourceOffer.show();},
  showRules(){this.setData({rulesOpen:true});},
  closeRules(){this.setData({rulesOpen:false});},
  changeQue(e){this.save();this.hand.que=Number(e.detail.value)===0?null:Number(e.detail.value)-1;this.refresh();},
  changeSeven(e){this.save();this.hand.sevenPairs=e.detail.value;this.refresh();},
  openPicker(e){this.cancelScan();this.pickerHistory=[];this.pickIndex=e.currentTarget.dataset.index==null?null:Number(e.currentTarget.dataset.index);this.pickMeld=e.currentTarget.dataset.meld||null;this.setData({picker:true,deleteMode:false});this.refresh();},
  closePicker(){this.pickIndex=null;this.pickMeld=null;this.pickerHistory=[];this.setData({picker:false,canPickerUndo:false});},
  undoPicker(){
    if(!this.data.picker||!this.pickerHistory||!this.pickerHistory.length)return;
    this.cancelScan();const previous=this.pickerHistory.pop();this.hand=previous.hand;this.history=previous.history;this.refresh();
  },
  noop(){},
  chooseTile(e){
    const t=Number(e.currentTarget.dataset.id),h=this.hand;
    if(this.pickMeld&&h.melds.length>=4)return this.notify('最多记录四组碰杠');
    if(!this.pickMeld&&this.pickIndex==null&&h.tiles.length>=14-h.melds.length*3)return this.notify('手牌已足够，请修改或删除');
    const next=copy(h);
    if(this.pickMeld)next.melds.push({tile:t,type:this.pickMeld});
    else if(this.pickIndex!=null){next.tiles[this.pickIndex]=t;next.uncertain=next.uncertain.filter(i=>i!==this.pickIndex);}
    else next.tiles.push(t);
    try{engine.validate(next.tiles,next);}catch(err){return this.notify(err.message);}
    if(this.data.picker){this.pickerHistory.push({hand:copy(h),history:this.history.slice()});if(this.pickerHistory.length>30)this.pickerHistory.shift();}
    this.save();this.hand=next;if(this.pickMeld||this.pickIndex!=null)this.closePicker();this.refresh();
  },
  toggleDeleteMode(){this.setData({deleteMode:this.hand.tiles.length>0&&!this.data.deleteMode});},
  tapHandTile(e){if(this.data.deleteMode)this.removeHandTile(e);else this.openPicker(e);},
  removeHandTile(e){
    if(!this.data.deleteMode)return;
    const i=Number(e.currentTarget.dataset.index);
    if(!Number.isInteger(i)||i<0||i>=this.hand.tiles.length)return;
    this.removeTileAt(i);this.refresh();
  },
  removeTileAt(i){this.cancelScan();this.save();this.hand.tiles.splice(i,1);this.hand.uncertain=this.hand.uncertain.filter(n=>n!==i).map(n=>n>i?n-1:n);},
  deleteTile(){const i=this.pickIndex;if(!Number.isInteger(i)||i<0||i>=this.hand.tiles.length)return;this.removeTileAt(i);this.closePicker();this.refresh();},
  removeMeld(e){this.save();this.hand.melds.splice(Number(e.currentTarget.dataset.index),1);this.refresh();},
  undo(){if(!this.history.length)return;this.cancelScan();this.hand=this.history.pop();this.refresh();},
  newRound(){this.save();this.cancelScan();this.hand=blank();this.setData({deleteMode:false});this.refresh();},
  example(e){this.save();this.cancelScan();this.hand=blank();this.hand.que=1;this.hand.tiles=[...'3344455667789'].map(n=>Number(n)-1);if(e.currentTarget.dataset.mode==='discards'){this.hand.mode='discards';this.hand.tiles.push(0);}this.refresh();},
  confirm(){
    if(this.hand.tiles.length!==this.data.expected)return this.notify(`需要 ${this.data.expected} 张，请核对漏牌`);
    try{engine.validate(this.hand.tiles,this.hand);}catch(e){return this.notify(e.message);}
    this.save();this.hand.pending=false;this.hand.uncertain=[];this.refresh();
  },
  toggleProof(){this.setData({proofOpen:!this.data.proofOpen});},
  toggleWait(e){const i=Number(e.currentTarget.dataset.index);this.setData({expandedWait:this.data.expandedWait===i?-1:i,proofOpen:true});},
  toggleDiscard(e){const i=Number(e.currentTarget.dataset.index);this.setData({expandedDiscard:this.data.expandedDiscard===i?-1:i});},
  async choosePhoto(e){
    if(this.data.busy)return;
    if(!recognition.configured())return wx.showModal({title:'拍照识牌尚未接通',content:'当前版本可手动选牌、查听口。识牌服务配置完成后才会启用拍照，不会上传照片。',showCancel:false});
    let permission;
    try{
      permission=await new Promise((resolve,reject)=>wx.showModal({title:'拍照识别',content:'照片会上传到云端识牌，并在处理后尝试删除。识别可能有错漏，请务必核对后确认。请只拍自己的手牌，避免带入人脸。',confirmText:'继续',success:r=>resolve(r.confirm),fail:reject}));
    }catch(err){this.notify('无法打开照片确认，请重新进入小程序再试');return;}
    if(!permission)return;
    this.cancelScan();const token=this.operation;this.setData({busy:true,deleteMode:false});
    try{
      const requestedSource=e&&e.currentTarget&&e.currentTarget.dataset.source;
      const sourceType=['camera','album'].includes(requestedSource)?[requestedSource]:['camera','album'];
      const result=await new Promise((resolve,reject)=>wx.chooseMedia({count:1,mediaType:['image'],sourceType,sizeType:['compressed'],camera:'back',success:resolve,fail:reject}));
      if(token!==this.operation)return;
      const file=result.tempFiles[0];if(file.size>10*1024*1024)throw Error('照片超过 10 MB，请压缩后重试');
      // Keep the original hand until recognition succeeds; hide results while busy.
      this.setData({waits:[],discards:[],winProof:''});
      const found=await recognition.upload(file.tempFilePath,task=>this.uploadTask=task);
      if(token!==this.operation)return;
      this.save();this.hand.pending=true;this.hand.photo=file.tempFilePath;
      this.hand.tiles=found.map(d=>d.tile);this.hand.uncertain=found.flatMap((d,i)=>d.confidence<.85||d.ambiguous?[i]:[]);this.refresh();
    }catch(e){if(token===this.operation&&!/cancel/.test(e.errMsg||e.message||''))this.notify(e.message||'选择照片未完成，请重试');}
    finally{if(token===this.operation){this.uploadTask=null;this.setData({busy:false});this.refresh();}}
  }
});
