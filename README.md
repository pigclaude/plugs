# PigClaude 官方插件目录

本仓库是 PigClaude 的官方插件目录。目录里的每个插件都经过维护者审核，目录文件用离线保管的 ed25519 私钥签名；PigClaude 内置两把公钥验证签名。规则见 [pigclaude/pigclaude#69](https://github.com/pigclaude/pigclaude/issues/69) 和 ADR 0012「插件市场信任模型」。

## 文件

| 路径                                  | 内容                                                         |
| ------------------------------------- | ------------------------------------------------------------ |
| `.claude-plugin/marketplace.json`     | 目录本身，Claude Code 的 marketplace.json 格式               |
| `.claude-plugin/marketplace.json.sig` | 目录文件原始字节的 ed25519 分离签名                          |
| `keys/current.pub.pem`                | 当前签名钥匙的公钥                                           |
| `keys/backup.pub.pem`                 | 备用签名钥匙的公钥                                           |
| `scripts/`                            | 生成钥匙、发布（签名）和校验的脚本，只用 Node 内置模块       |
| `docs/review-checklist.md`            | 插件上架和更新前的审核清单                                   |
| `docs/signing.md`                     | 私钥保管、发布步骤、移到离线介质                             |
| `docs/key-rotation.md`                | 启用备用钥匙、吊销旧钥匙                                     |

## 公钥指纹

指纹是原始 32 字节公钥的 sha256。

| 钥匙 | 指纹                                                                      |
| ---- | ------------------------------------------------------------------------- |
| 当前 | `sha256:224fb4889798e14d4d82e51fa7bd7d4b0ec02ee62707da2e273d4b9e2cedea6b` |
| 备用 | `sha256:ed22257b0d88d1c3e35cf6fb82af58043d2a0db3a22e4d4a49209ac035e37034` |

## 目录格式

顶层是 Claude Code 的 marketplace.json：`name`、`owner`、`metadata`、`plugins`。PigClaude 自己的字段放在扩展元数据里，Claude Code 不读它们。

`metadata.pigclaude`：

| 字段            | 含义                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------- |
| `formatVersion` | 扩展字段的格式版本，现在是 `1`                                                              |
| `serial`        | 递增序号。应用拒绝序号比它见过的更小的目录（防回滚）                                        |
| `issuedAt`      | 签发时间，UTC，精确到秒                                                                     |
| `expiresAt`     | 过期时间。过期后应用只拦安装和更新，不停用已装的插件                                        |
| `revoked`       | 吊销列表：`name`、`reason`、`revokedAt`，可选 `sha`（只吊销这个提交；不写就是吊销所有版本） |
| `revokedKeys`   | 吊销的签名钥匙指纹。应用不再接受这些钥匙签的目录                                            |

`plugins[]` 的每个条目：

- `name`、`description`、`version`，可选 `author`、`homepage`、`category` 等 Claude Code 字段。
- `source`：只能是 `{ "source": "github", "repo": "owner/repo", "sha": "<40 位提交号>" }`，可以加 `ref` 方便阅读，但安装只认 `sha`。
- `pigclaude`：
  - `kind`：`capability`（能力插件）或 `claude-code`（Claude Code 插件）。
  - `sha256`：`https://codeload.github.com/<repo>/tar.gz/<sha>` 这个归档的 sha256，小写十六进制。
  - `permissions`、`domains`：插件申请的权限和网络域名，安装前完整披露。
  - `review`：`{ "status": "reviewed", "reviewedAt": "<UTC>", "reviewer": "<可选>" }`。

## 校验

只需要本仓库里的公钥：

```sh
node scripts/verify-catalog.mjs
node --test tests/*.test.mjs
```

推送到 `main` 和每个 PR 都会在 CI 里跑这两步，并检查目录改了时序号是否递增。CI 不持有私钥，签名只在维护者本机进行，步骤见 [docs/signing.md](docs/signing.md)。
