// 验证目录格式校验和分离签名：只用测试里临时生成的钥匙。
import assert from "node:assert/strict"
import { generateKeyPairSync } from "node:crypto"
import { describe, it } from "node:test"
import {
  catalogProblems,
  publicKeyFingerprint,
  signCatalog,
  verifyCatalog,
} from "../scripts/catalog.mjs"

function testKey() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519")
  return {
    publicPem: publicKey.export({ format: "pem", type: "spki" }),
    privatePem: privateKey.export({ format: "pem", type: "pkcs8" }),
  }
}

function sampleCatalog() {
  return {
    name: "pigclaude-official",
    owner: { name: "PigClaude" },
    metadata: {
      description: "测试目录",
      pigclaude: {
        formatVersion: 1,
        serial: 3,
        issuedAt: "2026-11-14T00:00:00Z",
        expiresAt: "2027-02-12T00:00:00Z",
        revoked: [{ name: "old-tool", reason: "上游停止维护", revokedAt: "2026-11-01T00:00:00Z" }],
        revokedKeys: [],
      },
    },
    plugins: [
      {
        name: "clock",
        description: "读取当前时间",
        version: "1.0.0",
        source: { source: "github", repo: "pigclaude/clock", sha: "a".repeat(40) },
        pigclaude: {
          kind: "capability",
          sha256: "b".repeat(64),
          permissions: ["tools"],
          domains: [],
          review: { status: "reviewed", reviewedAt: "2026-11-13T00:00:00Z" },
        },
      },
    ],
  }
}

const bytes = (catalog) => Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`)

describe("目录格式", () => {
  it("锁定提交和 sha256、带序号和过期时间的目录通过", () => {
    assert.deepEqual(catalogProblems(sampleCatalog()), [])
  })

  it("条目没有锁定提交或 sha256 时拒绝", () => {
    const catalog = sampleCatalog()
    delete catalog.plugins[0].source.sha
    catalog.plugins[0].pigclaude.sha256 = "B".repeat(64)
    assert.deepEqual(catalogProblems(catalog), [
      "clock：source.sha 不是 40 位提交号",
      "clock：pigclaude.sha256 不是小写的 64 位十六进制",
    ])
  })

  it("只接受 GitHub 来源，不接受网址、npm 或本地路径", () => {
    for (const source of ["./plugins/clock", { source: "npm", package: "clock" }]) {
      const catalog = sampleCatalog()
      catalog.plugins[0].source = source
      assert.ok(catalogProblems(catalog).includes("clock：source 必须是 GitHub 仓库"))
    }
  })

  it("序号不是正整数、过期早于签发、名字重复时拒绝", () => {
    const catalog = sampleCatalog()
    catalog.metadata.pigclaude.serial = 0
    catalog.metadata.pigclaude.expiresAt = "2026-11-13T00:00:00Z"
    catalog.plugins.push(structuredClone(catalog.plugins[0]))
    assert.deepEqual(catalogProblems(catalog), [
      "metadata.pigclaude.serial 不是正整数",
      "metadata.pigclaude.expiresAt 不晚于 issuedAt",
      "clock：名字重复",
    ])
  })

  it("吊销条目缺少原因时拒绝", () => {
    const catalog = sampleCatalog()
    delete catalog.metadata.pigclaude.revoked[0].reason
    assert.deepEqual(catalogProblems(catalog), [
      "metadata.pigclaude.revoked[0] 需要 name、reason、revokedAt，sha 可选",
    ])
  })
})

describe("分离签名", () => {
  const current = testKey()
  const backup = testKey()
  const trusted = [current.publicPem, backup.publicPem]

  it("当前钥匙和备用钥匙签的目录都能验签，返回签名钥匙的指纹", () => {
    for (const key of [current, backup]) {
      const content = bytes(sampleCatalog())
      const keyId = verifyCatalog(content, signCatalog(content, key.privatePem), trusted)
      assert.equal(keyId, publicKeyFingerprint(key.publicPem))
    }
  })

  it("目录被改动一个字节后验签失败", () => {
    const content = bytes(sampleCatalog())
    const signature = signCatalog(content, current.privatePem)
    const tampered = Buffer.from(content)
    tampered[tampered.indexOf("3")] = "4".charCodeAt(0)
    assert.throws(() => verifyCatalog(tampered, signature, trusted), /签名与目录内容不符/)
  })

  it("不受信任的钥匙签的目录被拒绝", () => {
    const content = bytes(sampleCatalog())
    const signature = signCatalog(content, testKey().privatePem)
    assert.throws(() => verifyCatalog(content, signature, trusted), /不受信任/)
  })

  it("目录吊销了签名所用的钥匙时被拒绝", () => {
    const catalog = sampleCatalog()
    catalog.metadata.pigclaude.revokedKeys = [publicKeyFingerprint(current.publicPem)]
    const content = bytes(catalog)
    const signature = signCatalog(content, current.privatePem)
    assert.throws(() => verifyCatalog(content, signature, trusted), /已被吊销/)
  })

  it("指纹是原始公钥的 sha256", () => {
    assert.match(publicKeyFingerprint(current.publicPem), /^sha256:[0-9a-f]{64}$/)
    assert.notEqual(publicKeyFingerprint(current.publicPem), publicKeyFingerprint(backup.publicPem))
  })
})
