// 发布官方目录：序号加一、写签发和过期时间、校验格式、用仓库之外的私钥签名、用 keys/ 里的公钥验签，最后提交。
// 推送由维护者确认后手动执行。
// 用法：node scripts/publish-catalog.mjs [--key <私钥文件> | --keychain-service <服务名> --keychain-account <账户>]
//       [--days 90] [--no-commit]
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { CATALOG_PATH, SIGNATURE_PATH, catalogProblems, signCatalog, verifyCatalog } from "./catalog.mjs"
import { trustedPublicKeys } from "./trusted-keys.mjs"
import { DEFAULT_KEY_DIR, readPrivateKeyFile, readPrivateKeyFromKeychain } from "./private-key.mjs"

const DAY = 24 * 60 * 60 * 1000

const { values } = parseArgs({
  options: {
    key: { type: "string", default: join(DEFAULT_KEY_DIR, "current.pem") },
    "keychain-service": { type: "string" },
    "keychain-account": { type: "string" },
    days: { type: "string", default: "90" },
    "no-commit": { type: "boolean", default: false },
  },
})
const root = resolve(import.meta.dirname, "..")
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" })
const days = Number(values.days)
if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("--days 必须是 1 到 365 的整数")

const catalog = JSON.parse(readFileSync(join(root, CATALOG_PATH), "utf8"))
const previous = committedSerial(git)
const now = new Date(Math.floor(Date.now() / 1000) * 1000)
catalog.metadata.pigclaude.serial = previous + 1
catalog.metadata.pigclaude.issuedAt = now.toISOString().replace(".000Z", "Z")
catalog.metadata.pigclaude.expiresAt = new Date(now.getTime() + days * DAY)
  .toISOString()
  .replace(".000Z", "Z")
const problems = catalogProblems(catalog)
if (problems.length > 0) throw new Error(`目录格式不对：\n- ${problems.join("\n- ")}`)

const privateKeyPem = values["keychain-service"]
  ? readPrivateKeyFromKeychain(values["keychain-service"], values["keychain-account"] ?? "current")
  : readPrivateKeyFile(values.key)
const bytes = Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`, "utf8")
const signature = signCatalog(bytes, privateKeyPem)
const keyId = verifyCatalog(bytes, signature, trustedPublicKeys(root))
writeFileSync(join(root, CATALOG_PATH), bytes)
writeFileSync(join(root, SIGNATURE_PATH), signature)
console.log(`序号 ${previous + 1}，过期时间 ${catalog.metadata.pigclaude.expiresAt}，签名钥匙 ${keyId}`)
if (!values["no-commit"]) {
  git("add", CATALOG_PATH, SIGNATURE_PATH)
  git("commit", "-m", `catalog: publish serial ${previous + 1}`)
  console.log("已提交。核对后运行 git push origin main 发布。")
}

/** 上一次提交里的目录序号；还没有提交过目录时为 0。 */
function committedSerial(run) {
  try {
    return JSON.parse(run("show", `HEAD:${CATALOG_PATH}`)).metadata.pigclaude.serial
  } catch {
    return 0
  }
}
