"""Export the bundled, hash-verified PT file. Run only on a trusted local machine."""
from pathlib import Path
import hashlib, os, shutil, json
root=Path(__file__).resolve().parents[1]
source=root/'server/models/yolo11n_best.pt'
expected=json.loads((root/'server/models/source.json').read_text())['source_pt_sha256']
if hashlib.sha256(source.read_bytes()).hexdigest()!=expected:
    raise SystemExit('PT hash mismatch; refusing to load the pickle-based checkpoint')
os.environ['YOLO_CONFIG_DIR']=str(root/'build/export-config')
os.environ['YOLO_AUTOINSTALL']='false'
from ultralytics import YOLO
import onnx
target=Path(YOLO(str(source)).export(format='onnx',dynamic=True,imgsz=960,batch=1,
                                  opset=17,simplify=False,device='cpu',half=False,nms=False))
onnx.checker.check_model(onnx.load(str(target)))
print('Exported:',target)
print('SHA256:',hashlib.sha256(target.read_bytes()).hexdigest())
print('Export metadata may change the file hash. Re-run real-photo regression before deployment.')
