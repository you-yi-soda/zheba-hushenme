"""Geometric row selection; no reference labels, count truncation or fixed crop."""
import numpy as np

def locate(boxes,shape):
 # General spatial grouping. No sample coordinates or target tile count.
 H,W=shape[:2]
 if len(boxes)<2:raise RuntimeError('No coherent hand-row candidate')
 b=np.array([v['box'] for v in boxes]); ctr=(b[:,:2]+b[:,2:])/2; wh=b[:,2:]-b[:,:2]
 valid=np.where((wh[:,1]>.025*H)&(wh[:,0]>.012*W)&(wh[:,0]/wh[:,1]>.25)&(wh[:,0]/wh[:,1]<2.0))[0]
 groups={}
 for ia,i in enumerate(valid):
  for j in valid[ia+1:]:
   dx=ctr[j,0]-ctr[i,0]
   if abs(dx)<2*min(wh[i,0],wh[j,0]):continue
   slope=(ctr[j,1]-ctr[i,1])/dx
   if abs(slope)>.6:continue
   scale=np.sqrt(wh[i,1]*wh[j,1]);line=ctr[i,1]+slope*(ctr[:,0]-ctr[i,0])
   ids=[k for k in valid if abs(ctr[k,1]-line[k])<.30*scale and .60<wh[k,1]/scale<1.65]
   ids=sorted(ids,key=lambda k:ctr[k,0]); runs=[];run=[]
   for k in ids:
    if run and ctr[k,0]-ctr[run[-1],0]>2.1*np.median(wh[ids,0]):runs.append(run);run=[]
    run.append(k)
   if run:runs.append(run)
   for run in runs:
    if len(run)<5:continue
    key=tuple(run)
    medh=float(np.median(wh[run,1]));span=float(np.ptp(ctr[run,0])+np.median(wh[run,0]));cv=float(np.std(wh[run,1])/medh)
    # Row continuity/length dominate; lower position is only a weak tie-break.
    score=len(run)*(span/W)**.5*(medh/H)**.35/(1+2*cv)*(1+.15*np.mean(ctr[run,1])/H)
    groups[key]={'indices':run,'score':score,'count':len(run),'median_height':medh,'span':span,'slope':float(slope)}
 candidates=sorted(groups.values(),key=lambda a:a['score'],reverse=True)
 if not candidates:raise RuntimeError('No coherent hand-row candidate')
 chosen=candidates[0];sel=b[chosen['indices']];padx=.18*np.median(wh[chosen['indices'],0]);pady=.20*chosen['median_height']
 region=[max(0,int(sel[:,0].min()-padx)),max(0,int(sel[:,1].min()-pady)),min(W,int(np.ceil(sel[:,2].max()+padx))),min(H,int(np.ceil(sel[:,3].max()+pady)))]
 return region,chosen,candidates[:8]
