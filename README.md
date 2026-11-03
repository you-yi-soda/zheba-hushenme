# 这把胡什么 · 1.0.0 完整源码

2026-11-03。完整源码发布目录，包含原生微信小程序、识牌服务、模型与构建资料。主程序按 AGPL-3.0 路线提供，第三方文件保留各自许可证。项目所有者已同意公开整套项目，范围见 docs/release-decision.json。源码公开和微信正式发布分别记录，本仓库不表示小程序已经完成提审或上线。

公开仓库：https://github.com/you-yi-soda/zheba-hushenme

下载源码：打开仓库的 **Code → Download ZIP**，或使用 Git 克隆整个仓库。

## 内容

- `client/`：原生微信小程序、牌面资源、本地算牌、照片上传、核对修改与确认流程、现有测试。
- `server/`：轻量 ONNX CPU 识牌服务、原始 PT 和部署用动态 ONNX 权重、配置与接口测试。
- `upstream/Mahjong-YOLO/`：模型作者的源码、训练笔记本和转换脚本，固定到 `docs/upstream-retained.json` 所列提交。笔记本输出已移除，代码保留。
- `upstream/ultralytics-8.4.191/`：与导出工具版本一致的上游 Python 源码快照，不用于生产镜像安装。
- `tools/`：模型导出及完整源码/部署包构建工具。
- `LICENSES/`、`docs/`：许可原文、运行依赖清单、模型来源、现阶段证据与限制。

包中没有用户手牌照片、生产账号密钥、私人开发者工具配置或原运营环境标识。公开模板中 AppID 为 `touristappid`，云环境为空。实际使用须填入运营者自己的配置。

## 运行与测试

客户端：导入 `client/` 到微信开发者工具，填写自己的 AppID，在 `miniprogram/config.js` 填写云环境、云托管服务名。运行 `npm test` 检查本地规则与页面、照片上传流程、源码入口。

服务端：Python 3.12 环境安装 `server/requirements.txt`，运行 `python -m unittest discover -s server/tests -v`。生产使用单实例、8080端口、`REQUIRE_WECHAT_ID=1`、`ORT_THREADS=2`，配置自己的 `PHOTO_STORAGE_HOST`；微信云托管公网入口保持关闭。详见 `server/README.md`。

源码模板中不直接包含自身 ZIP，以免递归打包。先在工程根目录运行：

```sh
python tools/build_release.py
```

它生成 `build/mahjong-source-candidate.zip`、`build/mahjong-server-candidate.zip`、`build/mahjong-client-template.zip`，服务器部署包会内置对应完整源码 ZIP。之后针对 `build/server-deploy/tests` 执行测试，会额外验证下载 ZIP 与部署代码一致。

生产识牌只读取 ONNX。原始 PT 与上游训练代码一并提供给源码获取者，部署时不安装 PyTorch/Ultralytics。`tools/export_model.py` 可按原动态960、FP32、opset17参数重新导出；需另建环境安装 `tools/export-requirements.txt`。原始 PT 是 pickle 格式，只在来源和哈希核对后加载。导出时间等元数据可能改变输出哈希，不能凭哈希不同断言推理不兼容，需重跑照片回归。

## 公开源码获取

源码入口使用本仓库的公开地址。构建时运行：

```sh
python tools/build_release.py --source-url https://github.com/you-yi-soda/zheba-hushenme --release
```

源码入口地址应指向可匿名访问、包含对应部署版本完整源码的仓库；每次部署保留构建清单和相应提交。`--release` 仅检查 URL 已提供，不是授权审查或发布命令，构建报告仍保留未完成事项。构建工具不上传任何内容。

小程序「川麻·血战」规则面板中提供「开源与许可」，用户可复制公开地址。未配置时明确提示“源码地址待配置”，不能将这个候选版作为公开源码义务已经落实的证据。

服务器 `GET /source` 提供同版本 ZIP，`GET /source-info` 提供 SHA256与大小；沿用微信网关鉴权，不为提供源码而开放识牌服务公网入口。普通浏览器的匿名下载使用上面的独立公开托管地址。

## 当前限制

1. 本地真实样本仍会出现错认，所有识牌结果都必须核对后确认；模型分数不是准确率。没有新增训练或宣称提升精度。
2. 模型作者标注 MIT，Ultralytics 对完整项目提供 AGPL 开源路线；训练图片原始许可未独立取得。详见 `docs/许可证据与待完成事项.md`，不把开源包准备完成说成所有权利已核实。
3. 该候选版新增入口、源码接口尚未真机/线上验证；原版本的真机记录不等于本版本验收。
4. 微信备案、代码上传、提审与正式发布，以运营者后台最新状态为准，本包未执行这些操作。
