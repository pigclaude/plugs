// 负责官方插件目录的格式校验、ed25519 分离签名与验签，以及公钥指纹。签名脚本、发布脚本、CI 校验和测试共用。
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto"

export const CATALOG_PATH = ".claude-plugin/marketplace.json"
export const SIGNATURE_PATH = ".claude-plugin/marketplace.json.sig"
export const FORMAT_VERSION = 1

const COMMIT = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/
const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/
const KINDS = new Set(["capability", "claude-code"])

/**
 * 校验目录内容，返回发现的问题（空数组表示通过）。
 * 规则：Claude Code 的 marketplace.json 结构；PigClaude 字段在 metadata.pigclaude 和每个条目的 pigclaude 里；
 * 每个条目锁定 GitHub 提交和归档的 sha256；序号是正整数，过期时间晚于签发时间。
 */
export function catalogProblems(catalog) {
  const problems = []
  const fail = (message) => problems.push(message)
  if (!isRecord(catalog)) return ["目录不是 JSON 对象"]
  if (typeof catalog.name !== "string" || !NAME.test(catalog.name)) fail("name 无效")
  if (!isRecord(catalog.owner) || !nonEmpty(catalog.owner.name)) fail("owner.name 缺失")
  const extension = isRecord(catalog.metadata) ? catalog.metadata.pigclaude : undefined
  if (!isRecord(extension)) {
    fail("metadata.pigclaude 缺失")
  } else {
    if (extension.formatVersion !== FORMAT_VERSION) fail("metadata.pigclaude.formatVersion 不是 1")
    if (!Number.isSafeInteger(extension.serial) || extension.serial < 1) {
      fail("metadata.pigclaude.serial 不是正整数")
    }
    const issued = timestamp(extension.issuedAt)
    const expires = timestamp(extension.expiresAt)
    if (issued === null) fail("metadata.pigclaude.issuedAt 不是 UTC 时间")
    if (expires === null) fail("metadata.pigclaude.expiresAt 不是 UTC 时间")
    if (issued !== null && expires !== null && expires <= issued) {
      fail("metadata.pigclaude.expiresAt 不晚于 issuedAt")
    }
    revocationProblems(extension.revoked, fail)
    if (!Array.isArray(extension.revokedKeys)) {
      fail("metadata.pigclaude.revokedKeys 不是数组")
    } else if (!extension.revokedKeys.every((key) => FINGERPRINT.test(key))) {
      fail("metadata.pigclaude.revokedKeys 里有无效的指纹")
    }
  }
  if (!Array.isArray(catalog.plugins)) {
    fail("plugins 不是数组")
  } else {
    const names = new Set()
    catalog.plugins.forEach((entry, index) => {
      const label = isRecord(entry) && nonEmpty(entry.name) ? entry.name : `#${index}`
      if (isRecord(entry) && names.has(entry.name)) fail(`${label}：名字重复`)
      if (isRecord(entry)) names.add(entry.name)
      for (const problem of entryProblems(entry)) fail(`${label}：${problem}`)
    })
  }
  return problems
}

function entryProblems(entry) {
  if (!isRecord(entry)) return ["条目不是对象"]
  const problems = []
  if (typeof entry.name !== "string" || !NAME.test(entry.name)) problems.push("name 无效")
  if (!nonEmpty(entry.description)) problems.push("description 缺失")
  if (!nonEmpty(entry.version)) problems.push("version 缺失")
  const source = entry.source
  if (!isRecord(source) || source.source !== "github") {
    problems.push("source 必须是 GitHub 仓库")
  } else {
    if (typeof source.repo !== "string" || !REPO.test(source.repo)) problems.push("source.repo 无效")
    if (typeof source.sha !== "string" || !COMMIT.test(source.sha)) {
      problems.push("source.sha 不是 40 位提交号")
    }
  }
  const extension = entry.pigclaude
  if (!isRecord(extension)) return [...problems, "pigclaude 扩展字段缺失"]
  if (!KINDS.has(extension.kind)) problems.push("pigclaude.kind 不是 capability 或 claude-code")
  if (typeof extension.sha256 !== "string" || !SHA256.test(extension.sha256)) {
    problems.push("pigclaude.sha256 不是小写的 64 位十六进制")
  }
  if (!stringList(extension.permissions)) problems.push("pigclaude.permissions 不是字符串数组")
  if (!stringList(extension.domains)) problems.push("pigclaude.domains 不是字符串数组")
  const review = extension.review
  if (!isRecord(review) || review.status !== "reviewed" || timestamp(review.reviewedAt) === null) {
    problems.push("pigclaude.review 缺少审核状态或审核时间")
  }
  return problems
}

function revocationProblems(revoked, fail) {
  if (!Array.isArray(revoked)) {
    fail("metadata.pigclaude.revoked 不是数组")
    return
  }
  revoked.forEach((item, index) => {
    const ok =
      isRecord(item) &&
      typeof item.name === "string" &&
      NAME.test(item.name) &&
      (item.sha === undefined || (typeof item.sha === "string" && COMMIT.test(item.sha))) &&
      nonEmpty(item.reason) &&
      timestamp(item.revokedAt) !== null
    if (!ok) fail(`metadata.pigclaude.revoked[${index}] 需要 name、reason、revokedAt，sha 可选`)
  })
}

/** 公钥指纹：原始 32 字节 ed25519 公钥的 sha256，写成 `sha256:<十六进制>`。 */
export function publicKeyFingerprint(publicKeyPem) {
  const key = createPublicKey(publicKeyPem)
  if (key.asymmetricKeyType !== "ed25519") throw new Error("不是 ed25519 公钥")
  const raw = Buffer.from(key.export({ format: "jwk" }).x, "base64url")
  return `sha256:${createHash("sha256").update(raw).digest("hex")}`
}

/** 用私钥对目录文件的原始字节生成分离签名；返回签名文件的内容。 */
export function signCatalog(catalogBytes, privateKeyPem) {
  const privateKey = createPrivateKey(privateKeyPem)
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("不是 ed25519 私钥")
  const publicKeyPem = createPublicKey(privateKey).export({ format: "pem", type: "spki" })
  const signature = sign(null, catalogBytes, privateKey).toString("base64")
  const document = { algorithm: "ed25519", keyId: publicKeyFingerprint(publicKeyPem), signature }
  return `${JSON.stringify(document, null, 2)}\n`
}

/**
 * 用受信任的公钥验证分离签名；只有签名的钥匙在受信任列表里、没有被目录吊销、且签名对得上原始字节时返回通过的钥匙指纹。
 * 失败时抛出说明原因的错误。
 */
export function verifyCatalog(catalogBytes, signatureText, trustedPublicKeyPems) {
  const document = JSON.parse(signatureText)
  if (!isRecord(document) || document.algorithm !== "ed25519") throw new Error("签名算法不是 ed25519")
  const trusted = new Map(trustedPublicKeyPems.map((pem) => [publicKeyFingerprint(pem), pem]))
  const publicKeyPem = trusted.get(document.keyId)
  if (!publicKeyPem) throw new Error(`签名所用的钥匙 ${document.keyId} 不受信任`)
  const signature = Buffer.from(String(document.signature), "base64")
  if (!verify(null, catalogBytes, createPublicKey(publicKeyPem), signature)) {
    throw new Error("签名与目录内容不符")
  }
  const catalog = JSON.parse(catalogBytes.toString("utf8"))
  if (catalog?.metadata?.pigclaude?.revokedKeys?.includes(document.keyId)) {
    throw new Error(`签名所用的钥匙 ${document.keyId} 已被吊销`)
  }
  return document.keyId
}

function timestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim() !== ""
}

function stringList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item !== "")
}
