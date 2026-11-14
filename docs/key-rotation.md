# 钥匙轮换预案

PigClaude 内置当前和备用两把公钥，两把签的目录都接受。目录里的 `metadata.pigclaude.revokedKeys` 列出不再接受的钥匙指纹；应用验签通过后记住它，以后拒绝这些钥匙签的目录。

## 当前私钥泄露或丢失：启用备用钥匙、吊销旧钥匙

1. 改用备用钥匙签名，并吊销当前钥匙：在 `revokedKeys` 里加上当前钥匙的指纹（见 README），然后

   ```sh
   node scripts/publish-catalog.mjs --key <备用私钥> --days 90
   git push origin main
   ```

   序号加一。已经见过这个目录的应用从此拒绝旧钥匙签的目录，包括攻击者用泄露的私钥签的。
2. 旧的备用钥匙改作当前钥匙，再生成新的备用钥匙。私钥目录换成实际存放的位置（离线介质时用 `--key-dir`）：

   ```sh
   git mv keys/current.pub.pem keys/retired-<日期>.pub.pem
   git mv keys/backup.pub.pem keys/current.pub.pem
   mv <私钥目录>/current.pem <私钥目录>/retired-<日期>.pem
   mv <私钥目录>/backup.pem <私钥目录>/current.pem
   node scripts/keygen.mjs --role backup --key-dir <私钥目录>
   ```

   旧当前私钥确认不再需要后销毁。更新 README 的指纹表，按 [signing.md](signing.md) 把新私钥移到离线介质。
3. 在 pigclaude/pigclaude 开票：应用内置的两把公钥换成新的当前和备用，发布新版本。新版本发布前，旧版本应用靠 `revokedKeys` 拒绝旧钥匙。
4. 如果泄露期间可能有人用旧钥匙签过目录，检查本仓库的提交历史，必要时提高序号再发布一次。

## 两把私钥都丢失或泄露

应用无法再接受新目录，只能发布新版本应用：

1. 生成两把新钥匙，替换 `keys/` 里的公钥，用新的当前钥匙发布目录。
2. 发布内置新公钥的应用版本，并在发布说明里写明旧版本在升级前看不到新目录。
3. 两把私钥都泄露时，旧版本应用仍会接受攻击者签的目录，只有序号检查能拦住比它见过的更旧的目录；发布说明里提醒用户尽快升级。

## 例行轮换

不需要定期轮换。私钥一直离线保管，只在签名时插上介质。每次签名后核对 CI 通过，并确认介质上的指纹没变。
