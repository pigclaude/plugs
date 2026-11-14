// 负责从仓库之外读取签名私钥，以及把新生成的私钥写到仓库之外。私钥文件只允许所有者读写，目录只允许所有者进入。
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

/** 默认的私钥目录。 */
export const DEFAULT_KEY_DIR = join(process.env.HOME ?? "", ".pigclaude-signing", "plugs")

/** 路径或它的上级目录是 Git 工作区时返回工作区根目录，否则返回 null。 */
export function enclosingWorkTree(path) {
  let current = resolve(path)
  for (;;) {
    if (existsSync(join(current, ".git"))) return current
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

/** 读取私钥文件。文件必须在所有 Git 工作区之外，权限不能让组或其他用户访问。 */
export function readPrivateKeyFile(path) {
  const absolute = resolve(path)
  const workTree = enclosingWorkTree(absolute)
  if (workTree) throw new Error(`私钥文件在 Git 工作区 ${workTree} 里，拒绝使用`)
  if ((statSync(absolute).mode & 0o077) !== 0) throw new Error("私钥文件的权限必须是 600")
  return readFileSync(absolute, "utf8")
}

/** 把私钥写到 Git 工作区之外：目录权限 700，文件权限 600，已有文件时拒绝覆盖。 */
export function writePrivateKeyFile(path, privateKeyPem) {
  const absolute = resolve(path)
  const workTree = enclosingWorkTree(absolute)
  if (workTree) throw new Error(`拒绝把私钥写进 Git 工作区 ${workTree}`)
  mkdirSync(dirname(absolute), { recursive: true, mode: 0o700 })
  if ((statSync(dirname(absolute)).mode & 0o077) !== 0) {
    throw new Error(`私钥目录 ${dirname(absolute)} 的权限必须是 700`)
  }
  writeFileSync(absolute, privateKeyPem, { mode: 0o600, flag: "wx" })
}
