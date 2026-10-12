"""Freeze the accepted local sample and its exact source, without Git mutation."""
from pathlib import Path
from hashlib import sha256
import json
import zipfile

root = Path(__file__).resolve().parents[1]
evidence = root / "output/validation/shallow-final-closeout"
version = "shallow-sample-v1.0-local-20261012"
destination = root / "output/releases" / (version + ".zip")
destination.parent.mkdir(parents=True, exist_ok=True)
files = []

for folder in ["src", "public", "worker", ".openai"]:
    files.extend((p, "source/" + p.relative_to(root).as_posix())
                 for p in (root / folder).rglob("*") if p.is_file())
for name in ["package.json", "package-lock.json", "index.html", "vite.config.mjs", "AGENTS.md",
             "scripts/bake-shallow-cover.mjs", "scripts/prepare-sites-build.mjs", "scripts/validation-capture-plugin.mjs",
             "docs/SHALLOW_SAMPLE_FROZEN.md"]:
    p = root / name
    if p.is_file():
        files.append((p, "source/" + name))
for p in (root / "dist/client").rglob("*"):
    if p.is_file() and "output" not in p.relative_to(root / "dist/client").parts:
        files.append((p, "site/ocean-world/" + p.relative_to(root / "dist/client").as_posix()))
for name in ["preservation.json", "tests.log", "preparation-tests.log", "build.log", "build-final.log", "stage.json", "review.html"]:
    files.append((evidence / name, "validation/" + name))
files.extend((p, "validation/browser/" + p.name) for p in (evidence / "browser").iterdir() if p.is_file())
manifest = {
    "version": version,
    "status": "frozen-local-prototype",
    "entry": "/ocean-world/?demo=shallow-sample&seed=55",
    "files": [{"path": name, "bytes": p.stat().st_size, "sha256": sha256(p.read_bytes()).hexdigest()}
              for p, name in sorted(files, key=lambda pair: pair[1])],
}
manifest_text = json.dumps(manifest, ensure_ascii=False, indent=2)
(evidence / "freeze-manifest.json").write_text(manifest_text, encoding="utf-8")
readme = """浅海样板 v1.0 本地冻结版

解压后，在 site 目录运行：python -m http.server 4176 --bind 127.0.0.1
然后打开：http://127.0.0.1:4176/ocean-world/?demo=shallow-sample&seed=55
也可将 site 目录交给任意静态 HTTP 服务。不要直接双击 index.html。

source 保存此版本源码、原始素材和构建配置；在 source 运行 npm ci、npm run build:local 可重建。
validation 保存本机完整 75 秒播放记录及检查结果；完整历史验证 fixture 仍在原工作区。
freeze-manifest.json 逐文件标记 SHA-256；此归档不依赖之后工作区是否改动。
这是演示原型，不代表纪录片写实、完整生态或所有设备性能验收通过。
已有素材的署名、非商业和相同方式共享等条件继续有效，详见模型来源页面。
用户已要求停止默认扩展；不自动增加物种、替换资产、发布或开启下一轮优化。
"""
with zipfile.ZipFile(destination, "x", zipfile.ZIP_DEFLATED, compresslevel=1, strict_timestamps=False) as archive:
    for p, name in files:
        archive.write(p, name)
    archive.writestr("freeze-manifest.json", manifest_text)
    archive.writestr("README.txt", readme)
with zipfile.ZipFile(destination) as archive:
    assert archive.testzip() is None, "archive integrity check failed"
receipt = {"version": version, "archive": str(destination), "bytes": destination.stat().st_size,
           "sha256": sha256(destination.read_bytes()).hexdigest(), "files": len(files), "crcVerified": True}
(evidence / "freeze-receipt.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
print(json.dumps(receipt, indent=2))
