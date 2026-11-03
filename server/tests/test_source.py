import hashlib, io, sys, unittest, zipfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import create_app

class Fake:
    def recognize(self,image):raise AssertionError('source request must not run inference')

class SourceTests(unittest.TestCase):
    def setUp(self):
        self.client=create_app(Fake()).test_client()
        self.headers={'X-WX-OPENID':'source-test'}
    def test_auth(self):
        for route in ['/source','/source-info']:
            self.assertEqual(self.client.get(route).status_code,401)
    def test_missing_archive(self):
        with patch('app.Path.is_file',return_value=False):
            for route in ['/source','/source-info']:
                result=self.client.get(route,headers=self.headers)
                self.assertEqual(result.status_code,503)
                self.assertEqual(result.json['error']['code'],'SOURCE_NOT_PACKAGED')
    def test_packaged_download_matches_source(self):
        archive=Path(__file__).resolve().parents[1]/'source-release.zip'
        if not archive.exists():self.skipTest('Run this test against the built server-deploy folder')
        result=self.client.get('/source',headers=self.headers)
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.mimetype,'application/zip')
        self.assertIn('attachment',result.headers['Content-Disposition'])
        body=result.data;result.close()
        info=self.client.get('/source-info',headers=self.headers).json
        self.assertEqual(info['sha256'],hashlib.sha256(body).hexdigest())
        self.assertEqual(info['size'],len(body))
        with zipfile.ZipFile(io.BytesIO(body)) as z:
            for name in ['app.py','detector.py','row_locator.py','Dockerfile','requirements.txt']:
                self.assertEqual(z.read('server/'+name),(archive.parent/name).read_bytes())
            self.assertIn('client/miniprogram/utils/engine.js',z.namelist())
            self.assertIn('tools/export_model.py',z.namelist())
            self.assertNotIn('server/source-release.zip',z.namelist())

if __name__=='__main__':unittest.main()
