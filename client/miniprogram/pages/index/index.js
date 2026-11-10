const engine = require('../../utils/engine');
const recognition = require('../../services/recognition');
const sourceOffer = require('../../services/source-offer');
const sharing = require('../../services/sharing');
const copy = obj => JSON.parse(JSON.stringify(obj));
const blank = () => ({tiles:[],melds:[],que:null,sevenPairs:true,mode:'waits',pending:false,uncertain:[],photo:''});
const face = id => ({id,number:id%9+1,suit:engine.SUITS[Math.floor(id/9)],name:engine.tileName(id),image:`/assets/tiles/${id}.png`});
const proof = groups => groups.map(g => g.map(engine.tileName).join(' ')).join(' ｜ ');
const waitView = w => ({...face(w.tile),unseen:w.unseen,type:w.type,proof:proof(w.groups)});
const expectedOf = h => 13-h.melds.length*3+(h.mode==='discards'?1:0);
Page({
  data:{ready:false,picker:false,rulesOpen:false,gameModesOpen:false,busy:false,busyText:'',deleteMode:false,proofOpen:false,canPickerUndo:false,
    sampleTiles:[11,12,13,14,15,16,17].map(face),queOptions:['未设置','缺万','缺筒','缺条']},
  onLoad(){
    this.hand=blank();this.history=[];this.operation=0;this.unloaded=false;this.refresh();
    this.warmupPromise=recognition.warmup(task=>this.warmupTask=task).finally(()=>this.warmupTask=null);
  },
  onShow(){if(!this.copyListener)this.copyListener=sharing.bind();},
  onHide(){
    sharing.unbind(this.copyListener);this.copyListener=null;
    // Opening the native camera/album hides the page before the upload starts.
    if(this.uploadTask){this.cancelScan();this.refresh();}
  },
  onUnload(){
    this.unloaded=true;this.cancelScan();
    if(this.warmupTask)this.warmupTask.abort();
    sharing.unbind(this.copyListener);this.copyListener=null;
  },
  onShareAppMessage(){return sharing.appMessage();},
  onShareTimeline(){return sharing.timeline();},
  notify(message){wx.showToast({title:message,icon:'none',duration:3000});},
  save(){this.history.push(copy(this.hand));if(this.history.length>30)this.history.shift();},
  cancelScan(){
    this.operation=(this.operation||0)+1;this.scanStarting=false;
    const task=this.uploadTask;this.uploadTask=null;if(task)task.abort();
    if(!this.unloaded)this.setData({busy:false,busyText:''});
  },
  cancelRecognition(){this.cancelScan();this.refresh();},
  refresh(){
    const h=this.hand,expected=expectedOf(h),draft=this.pickerDraft||h;
    h.sevenPairs=true;draft.sevenPairs=true;
    const known=engine.countsOf(draft.tiles);draft.melds.forEach(m=>known[m.tile]+=m.type==='kong'?4:3);
    const palette=engine.SUITS.map((s,j)=>({suit:s,tiles:Array.from({length:9},(_,i)=>{
      const id=j*9+i;
      let used=known[id];
      if(this.pickIndex!=null&&draft.tiles[this.pickIndex]===id)used--;
      if(this.pickMeld&&this.meldChosen&&draft.melds[draft.melds.length-1].tile===id)used-=this.pickMeld==='kong'?4:3;
      return {...face(id),used:known[id],disabled:used+(this.pickMeld==='kong'?4:this.pickMeld==='pong'?3:1)>4};
    })}));
    let title='选好手牌，听口马上清楚',note=`当前查询需要 ${expected} 张手牌`,waits=[],discards=[],winProof='',error='';
    const begin=Date.now();
    if(!h.tiles.length){title='听哪张，马上心里有数';note='13 张查听口 · 14 张查打哪张能听';}
    else if(h.tiles.length!==expected){title=h.tiles.length<expected?`还差 ${expected-h.tiles.length} 张手牌`:`多了 ${h.tiles.length-expected} 张手牌`;}
    else try{
      const result=engine.analyze(h.tiles,h);
      if(result.kind==='waits'){
        waits=result.waits.map(waitView);title=waits.length?`听 ${waits.length} 种牌`:result.hasQue?'先打完定缺牌':'这手暂时还没听';
        note=waits.length?'点听口，查看拆牌依据':'当前规则下没有补一张就能胡的牌。';
      }else if(result.win){title='这手牌型已成胡';winProof=proof(result.win.groups);note=result.win.type+' · 实际能否胡还需符合本桌规则';}
      else{discards=result.discards.map(d=>({...face(d.tile),unseen:d.unseen,waitText:d.waits.map(w=>engine.tileName(w.tile)).join('、'),waits:d.waits.map(waitView)}));title=discards.length?'这样打，就能听':'暂时不能一打即听';note=result.hasQue?'优先打完定缺牌':'按未见张数排序，不代表整局最优打法';}
    }catch(e){title='请检查牌面';error=e.message;}
    let pickerError='',pickerCanConfirm=false,pickerStatus='';
    const pickerExpected=expectedOf(draft);
    if(this.pickerDraft){
      try{engine.validate(draft.tiles,draft);}catch(e){pickerError=e.message;}
      if(this.pickMeld){
        pickerStatus=this.meldChosen?`${this.pickMeld==='kong'?'杠':'碰'} ${engine.tileName(draft.melds[draft.melds.length-1].tile)}`:'请选择要记录的牌';
        pickerCanConfirm=!!this.meldChosen&&!pickerError;
      }else{
        const delta=pickerExpected-draft.tiles.length;
        pickerStatus=delta>0?`还差 ${delta} 张，请继续添加`:delta<0?`多了 ${-delta} 张，请删除多余牌`:'张数已齐，请核对牌面';
        pickerCanConfirm=delta===0&&!pickerError;
      }
    }
    this.setData({ready:true,mode:h.mode,expected,tiles:h.tiles.map((t,i)=>({...face(t),index:i,uncertain:h.uncertain.includes(i)})),
      melds:h.melds.map((m,i)=>({...face(m.tile),index:i,typeLabel:m.type==='kong'?'杠':'碰'})),palette,
      pending:false,photo:h.photo,queIndex:h.que==null?0:h.que+1,sevenPairs:true,
      canPickerUndo:!!(this.pickerHistory&&this.pickerHistory.length),
      title,note,error,waits:this.data.busy?[]:waits,discards:this.data.busy?[]:discards,winProof:this.data.busy?'':winProof,
      isEmpty:!h.tiles.length,elapsed:Date.now()-begin,expandedWait:-1,expandedDiscard:-1,proofOpen:false,
      deleteMode:!!h.tiles.length&&this.data.deleteMode,recognitionReady:recognition.configured(),
      pickerTiles:draft.tiles.map((t,i)=>({...face(t),index:i,uncertain:draft.uncertain.includes(i),replacing:this.pickIndex===i})),
      pickerExpected,pickerStatus,pickerError,pickerCanConfirm,pickerIsMeld:!!this.pickMeld,
      pickerReview:!!(this.pickerDraft&&this.pickerDraft.pending),
      pickerMeld:this.pickMeld&&this.meldChosen?{...face(draft.melds[draft.melds.length-1].tile),label:this.pickMeld==='kong'?'杠':'碰'}:null,
      pickerTitle:this.pickMeld?(this.pickMeld==='kong'?'记录杠牌':'记录碰牌'):this.pickIndex!=null?'修改手牌':this.pickerDraft&&this.pickerDraft.pending?'核对识别结果':'添加手牌',
      pickerHint:this.pickMeld?'从下方选择要记录的牌':this.pickIndex!=null?`选择下方牌面替换第 ${this.pickIndex+1} 张，也可点已选牌删除`:'核对牌面后，确认并计算'
    });
  },
  changeMode(e){
    const mode=e.currentTarget.dataset.mode;if(!['waits','discards'].includes(mode)||mode===this.hand.mode)return;
    this.cancelScan();this.closePicker();this.save();this.hand.mode=mode;this.refresh();
  },
  showSource(){sourceOffer.show();},
  showRules(){this.setData({rulesOpen:true,gameModesOpen:false});},
  closeRules(){this.setData({rulesOpen:false});},
  showGameModes(){this.setData({gameModesOpen:true,rulesOpen:false});},
  closeGameModes(){this.setData({gameModesOpen:false});},
  selectGameMode(){this.closeGameModes();},
  changeQue(e){
    const index=Number(e.detail.value);if(!Number.isInteger(index)||index<0||index>3)return;
    this.cancelScan();this.closePicker();this.save();this.hand.que=index===0?null:index-1;this.refresh();
  },
  startDraft(hand, options={}){
    this.pickerDraft=copy(hand);this.pickerHistory=[];
    this.pickIndex=options.index==null?null:options.index;this.pickMeld=options.meld||null;this.meldChosen=false;
    this.setData({picker:true,deleteMode:false});this.refresh();
  },
  openPicker(e){
    this.cancelScan();const d=e&&e.currentTarget?e.currentTarget.dataset:{};
    const index=d.index==null?null:Number(d.index),meld=d.meld||null;
    if(index!=null&&(!Number.isInteger(index)||index<0||index>=this.hand.tiles.length))return;
    if(meld&&!['pong','kong'].includes(meld))return;
    this.startDraft(this.hand,{index,meld});
  },
  closePicker(){
    this.pickerDraft=null;this.pickIndex=null;this.pickMeld=null;this.pickerHistory=[];this.meldChosen=false;
    this.setData({picker:false,canPickerUndo:false});
  },
  rememberPicker(){
    this.pickerHistory.push({hand:copy(this.pickerDraft),index:this.pickIndex,meldChosen:this.meldChosen});
    if(this.pickerHistory.length>30)this.pickerHistory.shift();
  },
  undoPicker(){
    if(!this.data.picker||!this.pickerHistory.length)return;
    const previous=this.pickerHistory.pop();this.pickerDraft=previous.hand;this.pickIndex=previous.index;this.meldChosen=previous.meldChosen;this.refresh();
  },
  noop(){},
  chooseTile(e){
    if(!this.pickerDraft)return;
    const t=Number(e.currentTarget.dataset.id),next=copy(this.pickerDraft);
    if(!Number.isInteger(t)||t<0||t>26)return;
    if(this.pickMeld){
      if(!this.meldChosen&&next.melds.length>=4)return this.notify('最多记录四组碰杠');
      if(this.meldChosen)next.melds.pop();
      next.melds.push({tile:t,type:this.pickMeld});
    }else if(this.pickIndex!=null){next.tiles[this.pickIndex]=t;next.uncertain=next.uncertain.filter(i=>i!==this.pickIndex);}
    else{
      if(next.tiles.length>=14-next.melds.length*3)return this.notify('手牌已足够，请修改或删除');
      next.tiles.push(t);
    }
    try{engine.validate(next.tiles,next);}catch(error){return this.notify(error.message);}
    this.rememberPicker();this.pickerDraft=next;this.pickIndex=null;if(this.pickMeld)this.meldChosen=true;this.refresh();
  },
  removePickerTile(e){
    if(!this.pickerDraft||this.pickMeld)return;
    const i=Number(e.currentTarget.dataset.index),h=this.pickerDraft;
    if(!Number.isInteger(i)||i<0||i>=h.tiles.length)return;
    this.rememberPicker();h.tiles.splice(i,1);h.uncertain=h.uncertain.filter(n=>n!==i).map(n=>n>i?n-1:n);
    if(this.pickIndex===i)this.pickIndex=null;else if(this.pickIndex>i)this.pickIndex--;
    this.refresh();
  },
  confirmPicker(){
    const draft=this.pickerDraft;if(!draft)return;
    try{engine.validate(draft.tiles,draft);}catch(error){return this.notify(error.message);}
    if(this.pickMeld){if(!this.meldChosen)return this.notify('请先选择要记录的牌');}
    else if(draft.tiles.length!==expectedOf(draft))return this.notify(`需要 ${expectedOf(draft)} 张，请核对牌面`);
    this.save();this.hand=copy(draft);this.hand.pending=false;this.hand.uncertain=[];this.hand.sevenPairs=true;
    this.closePicker();this.refresh();
  },
  toggleDeleteMode(){this.setData({deleteMode:this.hand.tiles.length>0&&!this.data.deleteMode});},
  tapHandTile(e){if(this.data.deleteMode)this.removeHandTile(e);else this.openPicker(e);},
  removeHandTile(e){
    if(!this.data.deleteMode)return;const i=Number(e.currentTarget.dataset.index);
    if(!Number.isInteger(i)||i<0||i>=this.hand.tiles.length)return;
    this.cancelScan();this.save();this.hand.tiles.splice(i,1);
    this.hand.uncertain=this.hand.uncertain.filter(n=>n!==i).map(n=>n>i?n-1:n);this.refresh();
  },
  removeMeld(e){
    const i=Number(e.currentTarget.dataset.index);if(!Number.isInteger(i)||i<0||i>=this.hand.melds.length)return;
    this.cancelScan();this.save();this.hand.melds.splice(i,1);this.refresh();
  },
  newRound(){this.cancelScan();this.closePicker();this.save();this.hand=blank();this.setData({deleteMode:false});this.refresh();},
  example(e){
    this.cancelScan();this.closePicker();this.save();this.hand=blank();this.hand.tiles=[...'3344455667789'].map(n=>Number(n)+8);
    if(e.currentTarget.dataset.mode==='discards'){this.hand.mode='discards';this.hand.tiles.push(9);}this.refresh();
  },
  toggleProof(){this.setData({proofOpen:!this.data.proofOpen});},
  toggleWait(e){this.setData({expandedWait:Number(e.currentTarget.dataset.index),proofOpen:true});},
  toggleDiscard(e){const i=Number(e.currentTarget.dataset.index);this.setData({expandedDiscard:this.data.expandedDiscard===i?-1:i});},
  async choosePhoto(e){
    if(this.data.busy||this.scanStarting)return;
    if(!recognition.configured())return wx.showModal({title:'拍照识牌尚未接通',content:'当前版本可手动选牌、查听口。识牌服务配置完成后才会启用拍照，不会上传照片。',showCancel:false});
    this.cancelScan();const token=this.operation;this.scanStarting=true;
    try{
      let permission;
      try{
        permission=await new Promise((resolve,reject)=>wx.showModal({title:'拍照识别',content:'照片会上传到云端识牌，并在处理后尝试删除。识别可能有错漏，请务必核对后确认。请只拍自己的手牌，避免带入人脸。',confirmText:'继续',success:r=>resolve(r.confirm),fail:reject}));
      }catch(_){if(token===this.operation)this.notify('无法打开照片确认，请重新进入小程序再试');return;}
      if(!permission||token!==this.operation)return;
      this.setData({busy:true,busyText:'请选择手牌照片',deleteMode:false});this.refresh();
      const requested=e&&e.currentTarget&&e.currentTarget.dataset.source;
      const result=await new Promise((resolve,reject)=>wx.chooseMedia({count:1,mediaType:['image'],sourceType:['camera','album'].includes(requested)?[requested]:['camera','album'],sizeType:['compressed'],camera:'back',success:resolve,fail:reject}));
      if(token!==this.operation)return;
      const file=result.tempFiles&&result.tempFiles[0];if(!file)throw Error('未选到照片，请重试');
      if(file.size>10*1024*1024)throw Error('照片超过 10 MB，请压缩后重试');
      const found=await recognition.upload(file.tempFilePath,task=>this.uploadTask=task,status=>{
        if(token!==this.operation||this.unloaded)return;
        const long=status.phase==='retrying'||status.phase==='waiting'||status.attempt===2;
        this.setData({busyText:status.phase==='uploading'?'正在上传照片':long?'处理时间较长，请稍候':'正在识别，请稍候'});
      });
      if(token!==this.operation)return;
      const draft=copy(this.hand);draft.pending=true;draft.photo=file.tempFilePath;
      draft.tiles=found.map(d=>d.tile);
      const counts=engine.countsOf(draft.tiles);
      draft.uncertain=found.flatMap((d,i)=>d.confidence<.85||d.ambiguous||counts[d.tile]>4?[i]:[]);
      this.startDraft(draft);
    }catch(error){
      if(token===this.operation&&!/cancel|abort/i.test(error.errMsg||error.message||''))this.notify(error.message||'选择照片未完成，请重试');
    }finally{
      if(token===this.operation&&!this.unloaded){this.scanStarting=false;this.uploadTask=null;this.setData({busy:false,busyText:''});this.refresh();}
    }
  }
});
