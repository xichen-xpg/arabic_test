# 每日数学发信服务

前端继续使用现有 GitHub Pages。后端是 Node.js 22.13+（建议 Node 24）的独立常驻服务，使用内置 SQLite，无需 npm 安装。只支持一个家庭/一个学生。

## 当前实现

- 首次使用从初一第一课开始；按实际开启作业的日期逐课推进，缺勤不会跳过课程。
- 当前内容只有前五课：正数和负数、有理数、数轴、相反数、绝对值。课库位于 `data/math/lessons.json`，包含材料、三级题目、答案和解析。学生PPT不包含答案。
- 每日首次下载在服务端启动30分钟计时。重复下载、刷新或换设备不会重置。
- 上传PPTX后由Resend发到固定地址 `xichen.app@gmail.com`，主题与PPT标题一致。
- 邮件服务确认接受后停止计时，30分钟内计打卡。计时包含上传、网络和邮件服务等待时间，不等于邮箱投递时间；重试确认较晚时保守地按确认时间计。
- 文件最大10MB，校验PPTX结构和下载时的文档标题。不检查作答是否填写或正确，不自动评分。
- SQLite保留开始、发送时间及邮件ID。未确认发送的附件临时保存在数据库用于幂等重试；确认后删除附件数据。超过23小时的未确认请求须人工查看发信服务记录再处理，避免超出服务商幂等窗口重复发信。
- 日期统一为Asia/Dubai，与当前网站一致。跨午夜仍可提交原作业，归属于下载那天。

## 部署

1. 准备一台支持Node 24、HTTPS和持久磁盘的服务器。不要把SQLite放在临时/无状态函数磁盘上；只运行一个实例。
2. 配置Resend发信账户和已验证的发信地址。测试发信地址能发送给谁取决于账户限制，不假定任意Gmail收件人都可用。收件地址固定，不需要收件邮箱密码。
3. 按 `.env.example` 配置环境变量（可在主机控制台配置）。`MATH_ACCESS_TOKEN`至少16字符，建议随机32字符；只供家庭成员使用。
4. 在项目根目录启动：`node --env-file=server/.env server/math-server.mjs`。若平台直接注入环境变量，运行 `node server/math-server.mjs` 即可。生产环境使用进程管理与HTTPS反向代理，限制请求体为11MB并设置上传超时。
5. 将公开HTTPS接口地址填入 `games/math-config.js` 的 `apiBase`，或在网页“连接作业服务”内填写。该地址不包含密钥。访问码只保存在浏览器sessionStorage，重新打开会话可能需要重输。
6. 原有GitHub Pages workflow无需改变。推送到main后发布静态页面；后端需独立部署。上线后用真实作答文件验证收件与打卡。

也可从项目根目录用 `docker build -f server/Dockerfile -t math-homework .` 构建镜像；运行时注入上述环境变量，并把持久卷挂到 `/data`，由托管平台或反向代理提供HTTPS。容器不会自动创建发信账户。

不要提交 `.env`、发信密钥、访问码、SQLite或学生作业。数据库应位于静态网站目录之外并定期备份。首次发信前页面会禁用正式下载，避免孩子做完后才发现不能发送。

## 本地验证

```text
node --test tools/math-server.test.mjs
node tools/math-browser.test.cjs
```

浏览器测试使用已有Playwright，必要时设置 `PLAYWRIGHT_MODULE` 为安装路径。测试使用模拟邮件服务，不向真实邮箱发信。提供了下载、PPT内容、上传、计时、重复发送和每日打卡验证。

## API

所有请求必须携带 `Authorization: Bearer <家庭访问码>`，CORS只允许配置的网页origin。

- `GET /today`：当天课程、服务端时间及历史状态。
- `POST /start`：开始或返回当天已有计时。
- `POST /submit`：二进制PPTX，头部 `X-Assignment-Id` 指定下载记录。邮箱和主题在服务端固定，客户端不能修改。

服务使用 [Resend发送接口](https://resend.com/docs/api-reference/emails/send-email) 和 [幂等键](https://resend.com/docs/dashboard/emails/idempotency-keys)。PPT生成使用MIT许可的PptxGenJS 3.12.0浏览器包，许可证随 `assets/vendor/` 分发。
