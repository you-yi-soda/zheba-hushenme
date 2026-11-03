# ONNX CPU 识牌服务

识牌模型及预处理、手牌排定位、640局部识牌逻辑沿用已跑通的轻量版。接口新增源码下载，不更换模型或改变识牌结果。

Python3.12安装 requirements.txt 后，运行 `gunicorn --bind 0.0.0.0:8080 --workers 1 --threads 4 --timeout 60 wsgi:app`。生产使用 Dockerfile；请先在完整源码包根目录运行 `python tools/build_release.py`，上传生成的服务器ZIP，Dockerfile必须在部署包根目录。

配置：`ORT_THREADS=2`，`REQUIRE_WECHAT_ID=1`，`PHOTO_STORAGE_HOST=自己的云存储完整域名`（不含协议、端口、路径或签名）。服务仅接受指定COS/tcb域名的HTTPS照片，不跟随重定向。关闭公网入口，通过微信云托管网关注入X-WX-OPENID。照片在内存处理，不写图片副本、不记录签名URL。

`GET /healthz` 健康检查；`POST /recognize-url` 接收JSON照片地址；`POST /recognize` 供本地multipart测试。输入上限10MB/1600万像素；单实例同时处理1张、每用户每分钟10次，先保持最大实例1。

`GET /source` 下载完整同版本源码ZIP，`GET /source-info` 返回ZIP大小与SHA256；两者沿用身份校验。普通用户的匿名源码下载应另设公开托管地址，不因此关闭识牌鉴权。缺少内置ZIP时返回503，不返回虚假链接。

源码模板同时提供PT与ONNX以便复现，生产实际上只用ONNX；不安装torch/ultralytics。用户照片不在源码包内。权重来源及许可证见models/source.json、THIRD_PARTY.md、完整包docs目录。

运行 `python -m unittest discover -s tests -v`。源码一致性测试需对构建后的server-deploy目录执行，才能读取实际内置ZIP。尚未执行本候选版Linux容器构建、云端更新或手机验收；本地测试结果见本次交付记录。
