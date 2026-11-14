// 发布官方目录：序号加一、写签发和过期时间、校验格式、用仓库之外的私钥签名、用 keys/ 里的公钥验签，最后只提交这两个文件。
// 推送由维护者确认后手动执行。
// 用法：node scripts/publish-catalog.mjs [--key <私钥文件>] [--days 90] [--no-commit]
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import {
  CATALOG_PATH,
  SIGNATURE_PATH,
  catalogProblems,
  serializeCatalog,
  signCatalog,
  successionProblems,
  utcSeconds,
  verifyCatalog,
} from "./catalog.mjs"
import { DEFAULT_KEY_DIR, readPrivateKeyFile } from "./private-key.mjs"
import { trustedPublicKeys } from "./trusted-keys.mjs"

const DAY = 24 * 60 * 60 * 1000

const { values } = parseArgs({
  options: {
    key: { type: "string", default: join(DEFAULT_KEY_DIR, "current.pem") },
    days: { type: "string", default: "90" },
    "no-commit": { type: "boolean", default: false },
  },
})
const root = resolve(import.meta.dirname, "..")
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
const days = Number(values.days)
if (!Number.isInteger(days) || days < 1 || days > 365)
  throw new Error("--days 必须是 1 到 365 的整数")

const catalog = JSON.parse(readFileSync(join(root, CATALOG_PATH), "utf8"))
const previous = committedCatalog()
const now = new Date()
const extension = catalog.metadata.pigclaude
extension.serial = (previous?.metadata.pigclaude.serial ?? 0) + 1
extension.issuedAt = utcSeconds(now)
extension.expiresAt = utcSeconds(new Date(now.getTime() + days * DAY))
const problems = catalogProblems(catalog)
if (problems.length > 0) throw new Error(`目录格式不对：\n- ${problems.join("\n- ")}`)

const bytes = serializeCatalog(catalog)
const signature = signCatalog(bytes, readPrivateKeyFile(values.key))
const keyId = verifyCatalog(bytes, signature, trustedPublicKeys(root))
const succession = previous ? successionProblems(previous, catalog, keyId) : []
if (succession.length > 0) throw new Error(succession.join("\n"))
writeFileSync(join(root, CATALOG_PATH), bytes)
writeFileSync(join(root, SIGNATURE_PATH), signature)
console.log(`序号 ${extension.serial}，过期时间 ${extension.expiresAt}，签名钥匙 ${keyId}`)
if (!values["no-commit"]) {
  git("add", CATALOG_PATH, SIGNATURE_PATH)
  git(
    "commit",
    "-m",
    `catalog: publish serial ${extension.serial}`,
    "--",
    CATALOG_PATH,
    SIGNATURE_PATH,
  )
  console.log("已提交。核对后运行 git push origin main 发布。")
}

/** 上一次提交里的目录；还没有提交过目录时为 null。 */
function committedCatalog() {
  let text
  try {
    text = git("show", `HEAD:${CATALOG_PATH}`)
  } catch {
    return null
  }
  return JSON.parse(text)
}
