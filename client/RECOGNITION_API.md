# 拍照识牌接口（2026-11-02）

此文件描述开源模板的接口。默认 cloudEnv 留空，不会上传照片；需填写自己的云环境。原运营版本曾完成云端及手机联调，不代表本候选版已经部署。

推荐调用链：wx.cloud.uploadFile → wx.cloud.getTempFileURL → wx.cloud.callContainer POST /recognize-url → finally 尝试 wx.cloud.deleteFile。

云托管请求只包含 JSON {"url":"私有云存储的短期图片链接"}；不把照片/base64 放入 callContainer。请求头 X-WX-SERVICE 为服务名，平台自动注入 X-WX-OPENID。云托管必须关闭公网访问，不能把可自行伪造的请求头当作公网鉴权。后端只读取 PHOTO_STORAGE_HOST 指定的自有存储域名；拒绝跳转和任意远程 URL。需开通容器到该云存储的网络访问。

服务端另保留 POST /recognize（multipart file）供本地测试；默认同样要求微信网关注入身份。如另接普通 HTTPS 需要独立实现鉴权，不能直接开放该接口。

返回 HTTP200：
```json
{"unsupported":false,"requiresConfirmation":true,"model":"mahjong-yolo11n","region":[24,638,1630,860],"imageSize":[1707,1280],"detections":[{"tile":2,"confidence":0.8,"ambiguous":true,"box":[40,660,190,800]}]}
```

tile：0–8 万、9–17 筒、18–26 条；均从一到九。每张物理牌一个结果，按左到右排序，模型去重不合并相邻同牌。框为 EXIF 方向修正后的原图像素坐标。当前页面不渲染原图框，仅保留原照片和手牌核对功能。

confidence 是模型分数，不是准确率；低于0.85、候选排相近或同牌超过4张时标黄。无论是否标黄，都必须人工确认；确认前不运行算牌。数量不足可补牌、多余可删除、错牌可替换；不能根据胡牌规则自动改牌。无法定位、超过14张或目标排存在未知/字牌时返回错误，不伪造手牌。少于5张的短手排尚不保证能定位，可手动选牌。

错误体 {"error":{"code":"NO_ROW","message":"未找到清楚的手牌排，请靠近手牌重拍，或手动选牌"}}，状态400/401/413/422/429/503等。客户端会保留原手牌并恢复原结果。

服务端图片上限10MB、解码16百万像素，仅JPEG/PNG/WebP。每实例同时只处理1张，同一用户每分钟最多10次；限流是单实例内存状态，重启会清空，部署先限制最大实例为1。模型常驻CPU，全图960定位、局部640识别、中心线过滤。照片只在内存解码，不写磁盘、不记录照片或签名URL。

客户端删除是尽力操作，断网/退出可能留存。因此云存储需配置 recognition/ 前缀1天过期规则，隐私说明须说明正常识别后发起删除、异常残留按过期规则清理。生命周期异步执行，不承诺精确24小时删除。私有存储仅允许创建者读写，不设置为公开读。

官方调用说明：https://docs.cloudbase.net/run/develop/access/mini
