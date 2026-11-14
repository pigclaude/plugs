// 校验官方目录：格式、分离签名，以及和上一版相比序号是否递增。CI 和维护者都用它，只需要公钥。
// 用法：node scripts/verify-catalog.mjs [--since <git 提交>]
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { CATALOG_PATH, SIGNATURE_PATH, catalogProblems, verifyCatalog } from "./catalog.mjs"
import { trustedPublicKeys } from "./trusted-keys.mjs"

const { values } = parseArgs({ options: { since: { type: "string" } } })
const root = resolve(import.meta.dirname, "..")
const bytes = readFileSync(join(root, CATALOG_PATH))
const catalog = JSON.parse(bytes.toString("utf8"))
const problems = catalogProblems(catalog)
if (problems.length > 0) throw new Error(`目录格式不对：\n- ${problems.join("\n- ")}`)
const keyId = verifyCatalog(bytes, readFileSync(join(root, SIGNATURE_PATH), "utf8"), trustedPublicKeys(root))
if (values.since) {
  const before = previousCatalog(values.since)
  if (before !== null && before !== bytes.toString("utf8")) {
    const old = JSON.parse(before).metadata.pigclaude.serial
    if (catalog.metadata.pigclaude.serial <= old) {
      throw new Error(`目录变了但序号没有递增：${old} → ${catalog.metadata.pigclaude.serial}`)
    }
  }
}
console.log(`目录有效：序号 ${catalog.metadata.pigclaude.serial}，签名钥匙 ${keyId}`)

function previousCatalog(ref) {
  try {
    return execFileSync("git", ["show", `${ref}:${CATALOG_PATH}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
  } catch {
    return null
  }
}
