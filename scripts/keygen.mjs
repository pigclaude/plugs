// 生成一把 ed25519 签名钥匙：私钥写到仓库之外（权限 600），公钥写进本仓库的 keys/，并打印公钥指纹。
// 用法：node scripts/keygen.mjs --role current|backup [--key-dir <目录>] [--keys <公钥目录>]
import { generateKeyPairSync } from "node:crypto"
import { existsSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { publicKeyFingerprint } from "./catalog.mjs"
import { DEFAULT_KEY_DIR, writePrivateKeyFile } from "./private-key.mjs"

const { values } = parseArgs({
  options: {
    role: { type: "string" },
    "key-dir": { type: "string", default: DEFAULT_KEY_DIR },
    keys: { type: "string", default: resolve(import.meta.dirname, "..", "keys") },
  },
})
if (!values.role || !/^[a-z0-9-]+$/.test(values.role)) {
  throw new Error("需要 --role，例如 current 或 backup")
}
const publicPath = join(values.keys, `${values.role}.pub.pem`)
if (existsSync(publicPath)) throw new Error(`${publicPath} 已存在，拒绝覆盖`)
const { publicKey, privateKey } = generateKeyPairSync("ed25519")
const privatePath = join(values["key-dir"], `${values.role}.pem`)
writePrivateKeyFile(privatePath, privateKey.export({ format: "pem", type: "pkcs8" }))
const publicPem = publicKey.export({ format: "pem", type: "spki" })
writeFileSync(publicPath, publicPem, { flag: "wx" })
console.log(`私钥：${privatePath}`)
console.log(`公钥：${publicPath}`)
console.log(`指纹：${publicKeyFingerprint(publicPem)}`)
