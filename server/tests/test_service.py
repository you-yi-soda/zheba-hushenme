import io,os,sys,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import numpy as np
from PIL import Image
from app import create_app,fetch_photo
from detector import Detector,RecognitionError

def photo():
    out=io.BytesIO();Image.new('RGB',(80,80),'white').save(out,format='JPEG');return out.getvalue()
class Fake:
    def recognize(self,image):
        assert image.shape==(80,80,3)
        return {'unsupported':False,'detections':[{'tile':2,'confidence':.7,'ambiguous':True}]}
class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.app=create_app(Fake());self.c=self.app.test_client();self.headers={'X-WX-OPENID':'test-user'}
    def test_auth_and_health(self):
        self.assertEqual(self.c.get('/healthz').status_code,200)
        self.assertEqual(self.c.post('/recognize').status_code,401)
    def test_upload_and_invalid(self):
        r=self.c.post('/recognize',headers=self.headers,data={'file':(io.BytesIO(photo()),'a.jpg')})
        self.assertEqual(r.status_code,200);self.assertEqual(r.json['detections'][0]['tile'],2)
        r=self.c.post('/recognize',headers=self.headers,data={'file':(io.BytesIO(b'not a photo'),'a.jpg')})
        self.assertEqual(r.status_code,400)
    def test_missing_and_rate(self):
        for i in range(10):self.assertEqual(self.c.post('/recognize',headers=self.headers).status_code,400)
        self.assertEqual(self.c.post('/recognize',headers=self.headers).status_code,429)
    def test_url_validation(self):
        for url in ['http://127.0.0.1/','https://evil.example/a','https://bucket.cos.ap-shanghai.myqcloud.com.evil.example/a']:
            with self.assertRaises(RecognitionError):fetch_photo(url)
    def test_cloud_fetch(self):
        with patch('app.fetch_photo',return_value=photo()):
            r=self.c.post('/recognize-url',headers=self.headers,json={'url':'https://own-bucket/photo'})
        self.assertEqual(r.status_code,200)
    def test_row_filter_mapping_no_forced_count(self):
        d=Detector.__new__(Detector)
        full=[{'name':'3m','confidence':.95,'box':[i*50+10,200,i*50+50,270]} for i in range(6)]
        # Crop offset x=2,y=186; include stray background off the inferred line.
        crop=[{'name':'3m','confidence':.95,'box':[i*50+8,14,i*50+48,84]} for i in range(6)]
        crop.append({'name':'1z','confidence':.99,'box':[100,0,120,5]})
        calls=iter([full,crop]);d.detect=lambda *args:next(calls)
        r=d.recognize(np.zeros((400,500,3),dtype=np.uint8))
        self.assertEqual(len(r['detections']),6);self.assertTrue(all(x['tile']==2 for x in r['detections']))
        self.assertTrue(all(x['ambiguous'] for x in r['detections']),'impossible fifth copy must be reviewed')
    def test_no_detections(self):
        d=Detector.__new__(Detector);d.detect=lambda *args:[]
        with self.assertRaises(RecognitionError):d.recognize(np.zeros((400,500,3),dtype=np.uint8))
if __name__=='__main__':unittest.main()
