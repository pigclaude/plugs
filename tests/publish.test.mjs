// 验证私钥只在仓库之外读写，以及发布脚本在临时仓库里递增序号、签名、验签并提交。只用临时生成的测试钥匙。
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createPrivateKey, generateKeyPairSync } from "node:crypto"
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { after, describe, it } from "node:test"
import { serializeCatalog, signCatalog } from "../scripts/catalog.mjs"
import { readPrivateKeyFile, writePrivateKeyFile } from "../scripts/private-key.mjs"

const repoRoot = resolve(import.meta.dirname, "..")
const scratch = mkdtempSync(join(tmpdir(), "plugs-test-"))
after(() => rmSync(scratch, { recursive: true, force: true }))

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519")
  return {
    publicPem: publicKey.export({ format: "pem", type: "spki" }),
    privatePem: privateKey.export({ format: "pem", type: "pkcs8" }),
  }
}

describe("私钥文件", () => {
  it("写到仓库之外时文件权限 600、目录权限 700，并能读回", () => {
    const path = join(scratch, "outside", "keys", "current.pem")
    writePrivateKeyFile(path, keyPair().privatePem)
    assert.equal(statSync(path).mode & 0o777, 0o600)
    assert.equal(statSync(join(scratch, "outside", "keys")).mode & 0o777, 0o700)
    assert.equal(createPrivateKey(readPrivateKeyFile(path)).asymmetricKeyType, "ed25519")
  })

  it("拒绝写进或读取 Git 工作区里的私钥", () => {
    const workTree = join(scratch, "work")
    mkdirSync(join(workTree, ".git"), { recursive: true })
    assert.throws(() => writePrivateKeyFile(join(workTree, "k.pem"), "x"), /Git 工作区/)
    writeFileSync(join(workTree, "k.pem"), "x", { mode: 0o600 })
    assert.throws(() => readPrivateKeyFile(join(workTree, "k.pem")), /Git 工作区/)
  })

  it("拒绝读取组或其他用户能访问的私钥", () => {
    const path = join(scratch, "loose.pem")
    writeFileSync(path, "x", { mode: 0o644 })
    assert.throws(() => readPrivateKeyFile(path), /权限必须是 600/)
  })
})

describe("发布脚本", () => {
  it("序号在上次提交的基础上加一，签名后验签通过并提交；再次校验能发现序号没有递增", () => {
    const repo = join(scratch, "repo")
    mkdirSync(join(repo, "keys"), { recursive: true })
    cpSync(join(repoRoot, "scripts"), join(repo, "scripts"), { recursive: true })
    cpSync(join(repoRoot, ".claude-plugin"), join(repo, ".claude-plugin"), { recursive: true })
    const current = keyPair()
    writeFileSync(join(repo, "keys", "current.pub.pem"), current.publicPem)
    writeFileSync(join(repo, "keys", "backup.pub.pem"), keyPair().publicPem)
    const keyPath = join(scratch, "publish-keys", "current.pem")
    writePrivateKeyFile(keyPath, current.privatePem)
    const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" })
    git("init", "-q", "-b", "main")
    git("config", "user.name", "test")
    git("config", "user.email", "test@example.invalid")
    git("config", "commit.gpgsign", "false")
    git("add", ".")
    git("commit", "-q", "-m", "seed")
    const before = JSON.parse(readFileSync(join(repo, ".claude-plugin/marketplace.json"), "utf8"))
    const node = (...args) => execFileSync(process.execPath, args, { cwd: repo, encoding: "utf8" })

    node("scripts/publish-catalog.mjs", "--key", keyPath, "--days", "30")

    const after = JSON.parse(readFileSync(join(repo, ".claude-plugin/marketplace.json"), "utf8"))
    const extension = after.metadata.pigclaude
    assert.equal(extension.serial, before.metadata.pigclaude.serial + 1)
    const lifetime = Date.parse(extension.expiresAt) - Date.parse(extension.issuedAt)
    assert.equal(lifetime, 30 * 24 * 60 * 60 * 1000)
    assert.match(git("log", "-1", "--format=%s"), /catalog: publish serial/)
    assert.match(node("scripts/verify-catalog.mjs", "--since", "HEAD~1"), /目录有效/)

    const stale = { ...after, metadata: { ...after.metadata, description: "改了内容没改序号" } }
    const staleBytes = serializeCatalog(stale)
    writeFileSync(join(repo, ".claude-plugin/marketplace.json"), staleBytes)
    writeFileSync(
      join(repo, ".claude-plugin/marketplace.json.sig"),
      signCatalog(staleBytes, current.privatePem),
    )
    assert.throws(
      () =>
        execFileSync(process.execPath, ["scripts/verify-catalog.mjs", "--since", "HEAD"], {
          cwd: repo,
          stdio: "pipe",
        }),
      (error) => String(error.stderr).includes("序号没有递增"),
    )
  })
})
