"""WeChat cloud container. Requests/images stay in memory; no photo logging."""
import io, os, time, threading, warnings
from collections import OrderedDict
from urllib.parse import urlsplit
import numpy as np
import requests
from PIL import Image, ImageOps, UnidentifiedImageError
from flask import Flask, request, jsonify, send_file
from pathlib import Path
import hashlib
from detector import Detector, RecognitionError

MAX_BYTES=10*1024*1024
Image.MAX_IMAGE_PIXELS=16_000_000

def decode_photo(content):
    signature = content.startswith(b'\xff\xd8') or content.startswith(b'\x89PNG\r\n\x1a\n') or (content.startswith(b'RIFF') and content[8:12]==b'WEBP')
    if not signature:raise RecognitionError('INVALID_IMAGE','照片无法读取，请换一张照片',400)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error',Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(content)) as image:
                if image.format not in ('JPEG','PNG','WEBP'): raise ValueError()
                image=ImageOps.exif_transpose(image)
                if min(image.size)<32:raise ValueError()
                return np.asarray(image.convert('RGB'))[:,:,::-1].copy()
    except (UnidentifiedImageError,OSError,ValueError,ImportError,SyntaxError,Image.DecompressionBombError,Image.DecompressionBombWarning):
        raise RecognitionError('INVALID_IMAGE','照片无法读取或尺寸过大，请换一张照片',400)

def fetch_photo(url):
    allowed=os.getenv('PHOTO_STORAGE_HOST','').lower().strip()
    try:
        p=urlsplit(url);port=p.port
    except ValueError:raise RecognitionError('INVALID_URL','照片地址无效',400)
    if not allowed or p.scheme!='https' or p.hostname!=allowed or port not in (None,443) or p.username or p.password:
        raise RecognitionError('INVALID_URL','照片存储地址未配置或不匹配',400)
    # Exact operator-controlled COS bucket only. No arbitrary URLs or redirects.
    if not ((allowed.endswith('.myqcloud.com') and '.cos.' in allowed) or allowed.endswith('.tcb.qcloud.la')):
        raise RecognitionError('STORAGE_CONFIG','请配置自己的微信云存储完整域名',503)
    try:
        with requests.get(url,stream=True,timeout=(3,8),allow_redirects=False) as r:
            if r.status_code!=200:raise RecognitionError('PHOTO_EXPIRED','照片已过期，请重新选择',400)
            parts=[];total=0;start=time.monotonic()
            for part in r.iter_content(65536):
                total+=len(part)
                if total>MAX_BYTES:raise RecognitionError('TOO_LARGE','照片超过 10 MB',413)
                if time.monotonic()-start>10:raise RecognitionError('FETCH_TIMEOUT','照片下载超时，请重试',504)
                parts.append(part)
            return b''.join(parts)
    except requests.RequestException:
        raise RecognitionError('PHOTO_FETCH','照片读取失败，请重试',502)

def create_app(detector=None):
    app=Flask(__name__);app.config['MAX_CONTENT_LENGTH']=MAX_BYTES+65536
    model=detector if detector is not None else Detector()
    gate=threading.BoundedSemaphore(1);rates=OrderedDict();rate_lock=threading.Lock()
    @app.errorhandler(RecognitionError)
    def expected(e):return jsonify(error={'code':e.code,'message':e.message}),e.status
    @app.errorhandler(413)
    def too_large(e):return jsonify(error={'code':'TOO_LARGE','message':'照片超过 10 MB'}),413
    @app.errorhandler(400)
    def invalid(e):return jsonify(error={'code':'BAD_REQUEST','message':'请求格式无效'}),400
    @app.errorhandler(500)
    def internal(e):return jsonify(error={'code':'INTERNAL','message':'识牌失败，请重试或手动选牌'}),500
    @app.get('/healthz')
    def health():return jsonify(ready=True,model='mahjong-yolo11n')
    @app.before_request
    def limits():
        if request.path=='/healthz':return
        # Trust these headers ONLY with public ingress disabled at the WeChat gateway.
        if os.getenv('REQUIRE_WECHAT_ID','1')=='1':
            who=request.headers.get('X-WX-OPENID','')
            if not who:raise RecognitionError('UNAUTHORIZED','请从小程序发起识牌',401)
        else:who=request.remote_addr or 'local'
        now=time.monotonic()
        with rate_lock:
            while rates and next(iter(rates.values()))[0]<now-60:rates.popitem(last=False)
            start,count=rates.get(who,(now,0))
            if now-start>=60:start,count=now,0
            if count>=10:raise RecognitionError('RATE_LIMIT','识牌太频繁，请稍后再试',429)
            rates[who]=(start,count+1)
            if len(rates)>10000:rates.popitem(last=False)
    def run(content):
        if not content:raise RecognitionError('EMPTY','请上传照片',400)
        if len(content)>MAX_BYTES:raise RecognitionError('TOO_LARGE','照片超过 10 MB',413)
        if not gate.acquire(blocking=False):raise RecognitionError('BUSY','识牌服务忙，请稍后重试',503)
        try:return jsonify(model.recognize(decode_photo(content)))
        finally:gate.release()
    @app.get('/source')
    def source_archive():
        archive=Path(__file__).parent/'source-release.zip'
        if not archive.is_file():
            return jsonify(error={'code':'SOURCE_NOT_PACKAGED','message':'源码包尚未打包'}),503
        return send_file(archive,mimetype='application/zip',as_attachment=True,
                         download_name='mahjong-master-source.zip',conditional=True)
    @app.get('/source-info')
    def source_info():
        archive=Path(__file__).parent/'source-release.zip'
        if not archive.is_file():
            return jsonify(error={'code':'SOURCE_NOT_PACKAGED','message':'源码包尚未打包'}),503
        return jsonify(license='AGPL-3.0',downloadPath='/source',
                       sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),size=archive.stat().st_size)
    @app.post('/recognize')
    def upload():
        f=request.files.get('file')
        if f is None:raise RecognitionError('MISSING_FILE','请上传照片',400)
        return run(f.stream.read(MAX_BYTES+1))
    @app.post('/recognize-url')
    def stored():
        if request.content_length and request.content_length>8192:raise RecognitionError('BAD_REQUEST','请求过大',400)
        data=request.get_json(silent=True)
        if not isinstance(data,dict) or not isinstance(data.get('url'),str):raise RecognitionError('MISSING_URL','缺少照片地址',400)
        if not gate.acquire(blocking=False):raise RecognitionError('BUSY','识牌服务忙，请稍后重试',503)
        try:return jsonify(model.recognize(decode_photo(fetch_photo(data['url']))))
        finally:gate.release()
    return app
