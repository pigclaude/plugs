// 负责读取本仓库 keys/ 里受信任的公钥：当前钥匙 current.pub.pem 和备用钥匙 backup.pub.pem。
import { readFileSync } from "node:fs"
import { join } from "node:path"

/** 受信任公钥的文件名，顺序即当前、备用。 */
export const TRUSTED_KEY_FILES = ["current.pub.pem", "backup.pub.pem"]

/** 读取仓库里两把受信任公钥的 PEM。 */
export function trustedPublicKeys(root) {
  return TRUSTED_KEY_FILES.map((name) => readFileSync(join(root, "keys", name), "utf8"))
}
