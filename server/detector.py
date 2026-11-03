"""YOLO11n ONNX Runtime CPU, full image 960 -> inferred row crop 640. CPU, no training."""
import os
from pathlib import Path
import numpy as np
from row_locator import locate

class RecognitionError(Exception):
    def __init__(self, code, message, status=422):
        self.code, self.message, self.status = code, message, status
        super().__init__(message)

class Detector:
    def __init__(self):
        import ast
        import onnxruntime as ort
        options=ort.SessionOptions()
        options.intra_op_num_threads=int(os.getenv('ORT_THREADS','2'))
        options.inter_op_num_threads=1
        self.session=ort.InferenceSession(str(Path(__file__).parent/'models/yolo11n_best.onnx'),
                                          sess_options=options,providers=['CPUExecutionProvider'])
        self.input_name=self.session.get_inputs()[0].name
        names=ast.literal_eval(self.session.get_modelmeta().custom_metadata_map['names'])
        self.names={int(k):v for k,v in names.items()}
        self.detect(np.zeros((640,640,3),dtype=np.uint8),640)

    def detect(self, image, size):
        import cv2
        h,w=image.shape[:2]
        gain=min(size/h,size/w)
        nw,nh=round(w*gain),round(h*gain)
        dw,dh=(size-nw)%32,(size-nh)%32
        left,right=round(dw/2-.1),round(dw/2+.1)
        top,bottom=round(dh/2-.1),round(dh/2+.1)
        resized=cv2.resize(image,(nw,nh),interpolation=cv2.INTER_LINEAR) if (nw,nh)!=(w,h) else image
        padded=cv2.copyMakeBorder(resized,top,bottom,left,right,cv2.BORDER_CONSTANT,value=(114,114,114))
        tensor=np.ascontiguousarray(padded[:,:,::-1].transpose(2,0,1)[None],dtype=np.float32)/255.
        prediction=self.session.run(None,{self.input_name:tensor})[0][0].T
        scores=prediction[:,4:].max(axis=1)
        rows=np.flatnonzero(scores>.12)
        if not len(rows):return []
        classes=prediction[rows,4:].argmax(axis=1);scores=scores[rows]
        xywh=prediction[rows,:4]
        boxes=np.concatenate((xywh[:,:2]-xywh[:,2:]/2,xywh[:,:2]+xywh[:,2:]/2),axis=1)
        # Class-agnostic NMS: remove duplicate boxes, preserve adjacent identical tiles.
        order=np.argsort(-scores,kind='stable')[:30000];keep=[]
        while order.size and len(keep)<300:
            i=int(order[0]);keep.append(i)
            rest=order[1:]
            if not len(rest):break
            lt=np.maximum(boxes[i,:2],boxes[rest,:2]);rb=np.minimum(boxes[i,2:],boxes[rest,2:])
            wh=np.maximum(rb-lt,0);intersection=wh[:,0]*wh[:,1]
            area=np.maximum(boxes[:,2]-boxes[:,0],0)*np.maximum(boxes[:,3]-boxes[:,1],0)
            iou=intersection/(area[i]+area[rest]-intersection+1e-7)
            order=rest[iou<=.45]
        boxes[:,[0,2]]=(boxes[:,[0,2]]-left)/gain
        boxes[:,[1,3]]=(boxes[:,[1,3]]-top)/gain
        boxes[:,[0,2]]=np.clip(boxes[:,[0,2]],0,w)
        boxes[:,[1,3]]=np.clip(boxes[:,[1,3]],0,h)
        return [{'name':self.names[int(classes[i])],'confidence':float(scores[i]),'box':boxes[i].tolist()} for i in keep]

    def recognize(self, image):
        full = self.detect(image, 960)
        try:
            region, chosen, candidates = locate(full, image.shape)
        except RuntimeError:
            raise RecognitionError('NO_ROW','未找到清楚的手牌排，请靠近手牌重拍，或手动选牌')
        x1,y1,x2,y2 = region
        found = self.detect(image[y1:y2,x1:x2],640)
        # Keep detections on the inferred row, excluding vertically adjacent background.
        selected=np.array([full[i]['box'] for i in chosen['indices']])
        centers=(selected[:,:2]+selected[:,2:])/2
        slope,intercept=np.polyfit(centers[:,0],centers[:,1],1)
        height=float(np.median(selected[:,3]-selected[:,1]))
        kept=[]
        for d in found:
            a,b,c,e=d['box']; cx=(a+c)/2+x1;cy=(b+e)/2+y1
            if abs(cy-(slope*cx+intercept))>.4*height: continue
            d['box']=[a+x1,b+y1,c+x1,e+y1];kept.append(d)
        if not kept:
            raise RecognitionError('NO_TILES','没有认清手牌，请重拍或手动选牌')
        if len(kept)>14:
            raise RecognitionError('TOO_MANY','识别范围里牌太多，请只拍自己的手牌')
        kept.sort(key=lambda d:(d['box'][0]+d['box'][2])/2)
        # Similar competing rows are flagged, never silently called confident.
        alternate=next((c for c in candidates[1:] if len(set(c['indices'])&set(chosen['indices']))/max(1,len(set(c['indices'])|set(chosen['indices'])))<.5),None)
        ambiguous=alternate is not None and alternate['score']>=.85*chosen['score']
        detections=[]
        for d in kept:
            name=d['name'];tile=None
            if len(name)==2 and name[0] in '123456789' and name[1] in 'mps':
                tile='mps'.index(name[1])*9+int(name[0])-1
            elif name in ('0m','0p','0s'):
                tile='mps'.index(name[1])*9+4
            if tile is None:
                raise RecognitionError('UNSUPPORTED','手牌中有未认清的牌或字牌，请重拍或手动选牌')
            detections.append({'tile':tile,'confidence':d['confidence'],
                               'ambiguous':ambiguous or d['confidence']<.85,'box':d['box']})
        counts={t:sum(d['tile']==t for d in detections) for t in {d['tile'] for d in detections}}
        for d in detections:
            if counts[d['tile']]>4:d['ambiguous']=True
        return {'unsupported':False,'detections':detections,'region':region,
                'imageSize':[image.shape[1],image.shape[0]],'model':'mahjong-yolo11n',
                'requiresConfirmation':True}
