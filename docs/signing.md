# 签名与发布

签名只在维护者本机进行。私钥不进任何仓库，也不放进 CI secret、Issue、日志或测试夹具。

## 私钥

两把 ed25519 钥匙，私钥是 PKCS#8 PEM：

| 钥匙 | 默认位置                                | 公钥                   |
| ---- | --------------------------------------- | ---------------------- |
| 当前 | `~/.pigclaude-signing/plugs/current.pem` | `keys/current.pub.pem` |
| 备用 | `~/.pigclaude-signing/plugs/backup.pem`  | `keys/backup.pub.pem`  |

目录权限 700，文件权限 600。脚本拒绝读取在 Git 工作区里、或者组和其他用户能访问的私钥文件。

也可以把私钥放在 macOS 钥匙串的通用密码条目里（内容是整段 PEM），发布时用 `--keychain-service <服务名> --keychain-account <账户>` 读取。

## 发布

1. 按 [审核清单](review-checklist.md) 改好 `.claude-plugin/marketplace.json`，只改条目、吊销列表或吊销的钥匙，不手改序号和时间。
2. 运行：

   ```sh
   node scripts/publish-catalog.mjs --key ~/.pigclaude-signing/plugs/current.pem --days 90
   ```

   脚本把序号设为上次提交的序号加一，写入签发时间和过期时间，校验格式，用私钥签名，再用 `keys/` 里的公钥验签，然后提交。
3. 核对提交，`git push origin main`。CI 的「Verify catalog」会再校验一次。

目录过期前（默认 90 天）要重新发布一次，即使内容没变；过期后应用会拦下安装和更新。

## 移到离线介质

私钥在本机生成后，按下面的步骤移到离线介质（例如加密 U 盘）。两把钥匙分开放在两份介质上更好。

1. 把 `~/.pigclaude-signing/plugs/current.pem` 和 `backup.pem` 复制到离线介质。
2. 核对指纹：在任一台装有 Node 的机器上，从离线介质读取私钥并算出公钥指纹，和 README 里的指纹一致：

   ```sh
   node -e 'const c=require("node:crypto");const k=c.createPublicKey(c.createPrivateKey(require("node:fs").readFileSync(process.argv[1])));console.log("sha256:"+c.createHash("sha256").update(Buffer.from(k.export({format:"jwk"}).x,"base64url")).digest("hex"))' /Volumes/<介质>/current.pem
   ```

3. 用离线介质上的私钥试签一次，并用公钥验签通过（不提交）：

   ```sh
   node scripts/publish-catalog.mjs --key /Volumes/<介质>/current.pem --no-commit
   node scripts/verify-catalog.mjs
   git checkout -- .claude-plugin
   ```

   对备用钥匙重复一次（`--key /Volumes/<介质>/backup.pem`）。
4. 删除本机副本：`rm -P ~/.pigclaude-signing/plugs/current.pem ~/.pigclaude-signing/plugs/backup.pem`，再删除空目录。如果放进过钥匙串，也删除条目：`security delete-generic-password -s <服务名> -a <账户>`。
5. 以后发布时插上介质，用 `--key /Volumes/<介质>/current.pem`；介质上的文件权限同样要是 600。
