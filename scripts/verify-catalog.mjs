// 校验官方目录：格式、分离签名、是否过期，以及和上一版相比序号递增、吊销的钥匙只增不减。
// CI 和维护者都用它，只需要公钥。
// 用法：node scripts/verify-catalog.mjs [--since <git 提交>]
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import {
  CATALOG_PATH,
  SIGNATURE_PATH,
  catalogProblems,
  successionProblems,
  verifyCatalog,
} from "./catalog.mjs"
import { trustedPublicKeys } from "./trusted-keys.mjs"

const { values } = parseArgs({ options: { since: { type: "string" } } })
const root = resolve(import.meta.dirname, "..")
const bytes = readFileSync(join(root, CATALOG_PATH))
const signature = readFileSync(join(root, SIGNATURE_PATH), "utf8")
const keyId = verifyCatalog(bytes, signature, trustedPublicKeys(root))
const catalog = JSON.parse(bytes.toString("utf8"))
const problems = catalogProblems(catalog)
if (Date.parse(catalog.metadata?.pigclaude?.expiresAt) <= Date.now()) problems.push("目录已过期")
if (values.since) {
  const before = previousCatalog(values.since)
  if (before !== null && before !== bytes.toString("utf8")) {
    problems.push(...successionProblems(JSON.parse(before), catalog, keyId))
  }
}
if (problems.length > 0) throw new Error(`目录无效：\n- ${problems.join("\n- ")}`)
console.log(`目录有效：序号 ${catalog.metadata.pigclaude.serial}，签名钥匙 ${keyId}`)

/** 指定提交里的目录文本；那个提交里还没有目录时为 null，提交本身不存在时报错。 */
function previousCatalog(ref) {
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
  git("cat-file", "-e", `${ref}^{commit}`)
  try {
    return git("show", `${ref}:${CATALOG_PATH}`)
  } catch {
    return null
  }
}
