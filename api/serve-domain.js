// api/serve-domain.js
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');

module.exports = async (req, res) => {
  // 1. 获取访问的域名并移除'www.'前缀
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').replace('^www\.', '');

  // 2. 基础安全校验：确保是合法域名格式
  if (!host || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) {
    res.status(400).send('无效的域名请求。');
    return;
  }

  // 3. 构造对应域名的HTML文件路径
  // 关键：假设你的文件夹名就是纯域名（如 asia.tv）
  const domainFolder = host;
  const filePath = join(process.cwd(), domainFolder, 'index.html');

  // 4. 检查文件是否存在并返回
  if (existsSync(filePath)) {
    try {
      const htmlContent = readFileSync(filePath, 'utf-8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(htmlContent);
    } catch (error) {
      console.error(`读取文件出错 (${filePath}):`, error);
      res.status(500).send('服务器内部错误，无法读取页面。');
    }
  } else {
    // 如果该域名没有对应的文件夹，返回404
    console.warn(`未找到域名对应的页面: ${host}`);
    res.status(404).send(`抱歉，域名 "${host}" 的展示页面尚未创建。`);
  }
};