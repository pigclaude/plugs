# 审核清单

插件上架或更新前，维护者逐条核对。任何一条不满足就不上架；结论和例外写在 PR 描述里。

## 来源

- [ ] 来源是公开的 GitHub 仓库，`source.sha` 是一个完整的 40 位提交号，不是分支名或 tag。
- [ ] 下载 `https://codeload.github.com/<repo>/tar.gz/<sha>`，本机计算 sha256，和条目里的 `pigclaude.sha256` 一致。
- [ ] 仓库有许可证，允许分发。
- [ ] 作者身份可以核实（GitHub 账号、主页或以往的项目）。

## 内容

- [ ] 读过这个提交的全部源码，不只是 diff；更新时额外读上一个已审核提交到这个提交的 diff。
- [ ] 没有打包的二进制、混淆或压缩过的代码；有构建产物时能从源码重新构建出同样的结果。
- [ ] 没有运行时下载并执行代码（`eval`、`new Function`、远程脚本、动态 `import` 网址）。
- [ ] 能力插件：清单里的权限和域名与代码实际用到的一致，没有多申请。
- [ ] 能力插件：网络请求只发往声明的域名。
- [ ] Claude Code 插件：PigClaude 只加载 skills、命令和子代理，不执行插件的 hooks 和 MCP。插件依赖 hooks 或 MCP 才能用时，在 `description` 里写明，避免用户以为装上就能用。
- [ ] skills 和命令的文字没有诱导模型读取凭据、关闭权限检查或访问未声明的网址。
- [ ] 不收集用户数据；确实需要的，在 `description` 里写明收集什么、发到哪里。

## 披露

- [ ] `description` 说清楚插件做什么，不夸大。
- [ ] `pigclaude.kind`、`permissions`、`domains` 填写完整，和代码一致。
- [ ] 更新时权限或域名变多了：在 PR 里写明原因（应用会让用户重新确认）。

## 发布

- [ ] `pigclaude.review` 写上审核时间和审核人。
- [ ] 用 `node scripts/publish-catalog.mjs` 发布（序号加一、签名、验签、提交），见 [signing.md](signing.md)。
- [ ] 推送后 CI 的「Verify catalog」通过。

## 吊销

发现已上架的插件有问题时：

- [ ] 在 `metadata.pigclaude.revoked` 加一条：`name`、`repo`、`reason`（给用户看的原因）、`revokedAt`；只影响某个提交时写 `sha`。
- [ ] 从 `plugins` 里删除或换成修复后的提交。
- [ ] 立即发布新目录；应用刷新后自动停用命中的插件并显示原因。
