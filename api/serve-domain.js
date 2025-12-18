// api/serve-domain.js
// Vercel Serverless Function - 动态域名路由处理器
const { readFileSync, existsSync, statSync } = require('fs');
const { join, normalize } = require('path');

module.exports = async (req, res) => {
  // ==================== 1. 获取并净化域名 ====================
  const rawHost = req.headers['x-forwarded-host'] || req.headers.host || '';
  // 移除端口号和 'www.' 前缀
  const host = rawHost.split(':')[0].replace(/^www\./i, '');
  
  console.log(`[${new Date().toISOString()}] 请求: host="${rawHost}", clean="${host}", path="${req.url}"`);

  // ==================== 2. 安全验证（防止路径遍历攻击） ====================
  if (!host || !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(host)) {
    console.warn(`安全拒绝: 无效域名格式 "${host}"`);
    return send404(res, `无效域名: ${host}`);
  }

  // 防止使用相对路径进行目录遍历
  if (host.includes('..') || host.includes('/') || host.includes('\\')) {
    console.warn(`安全拒绝: 可疑域名 "${host}"`);
    return send404(res, '非法请求');
  }

  // ==================== 3. 构建文件路径并检查 ====================
  try {
    // 重要: 基于当前工作目录构建路径
    const siteDir = join(process.cwd(), host);
    const indexPath = join(siteDir, 'index.html');
    
    // 规范化路径，防止绕过
    const normalizedPath = normalize(indexPath);
    if (!normalizedPath.startsWith(process.cwd())) {
      console.warn(`安全拒绝: 路径越界 "${normalizedPath}"`);
      return send404(res, '非法路径访问');
    }

    console.log(`尝试访问: ${normalizedPath}`);

    // ==================== 4. 检查文件是否存在且可读 ====================
    if (!existsSync(normalizedPath)) {
      console.log(`文件不存在: ${host}/index.html`);
      
      // 优雅回退：如果访问的是根域名但没有对应站点，显示导航首页
      const rootIndexPath = join(process.cwd(), 'index.html');
      if (existsSync(rootIndexPath) && req.url === '/') {
        console.log(`回退到根目录首页`);
        return sendHtml(res, rootIndexPath, 200);
      }
      
      return send404(res, `域名 "${host}" 的页面尚未创建`);
    }

    // 检查是否是文件（不是目录）
    const stats = statSync(normalizedPath);
    if (!stats.isFile()) {
      console.warn(`路径不是文件: ${normalizedPath}`);
      return send404(res, '资源类型错误');
    }

    // ==================== 5. 成功返回HTML内容 ====================
    console.log(`成功找到文件，准备返回: ${host}/index.html`);
    return sendHtml(res, normalizedPath, 200);

  } catch (error) {
    // ==================== 6. 异常处理 ====================
    console.error(`处理请求时出错 (host: ${host}):`, error);
    
    if (error.code === 'ENOENT') {
      return send404(res, '请求的资源不存在');
    } else if (error.code === 'EACCES') {
      return sendError(res, 403, '没有访问权限');
    } else {
      return sendError(res, 500, '服务器内部错误');
    }
  }
};

// ==================== 辅助函数 ====================

/**
 * 发送HTML文件内容
 */
function sendHtml(res, filePath, statusCode = 200) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    
    // 设置智能缓存头：静态资源缓存1小时
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=7200');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Powered-By', 'Vercel-Domain-Router/1.0');
    
    res.status(statusCode).send(content);
    console.log(`响应: ${statusCode} ${filePath}`);
  } catch (readError) {
    console.error(`读取文件失败 ${filePath}:`, readError);
    sendError(res, 500, '无法读取页面内容');
  }
}

/**
 * 发送404错误页面
 */
function send404(res, message = '页面未找到') {
  const notFoundHtml = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>404 - 页面未找到</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
               background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
               color: white; text-align: center; padding: 60px 20px; min-height: 100vh; }
        .container { max-width: 600px; margin: 0 auto; }
        h1 { font-size: 120px; margin: 0; opacity: 0.9; }
        h2 { font-size: 28px; margin: 20px 0; }
        p { font-size: 18px; margin-bottom: 30px; opacity: 0.8; }
        .btn { display: inline-block; background: white; color: #764ba2; 
               padding: 12px 30px; border-radius: 50px; text-decoration: none; 
               font-weight: bold; margin: 10px; transition: transform 0.3s; }
        .btn:hover { transform: translateY(-3px); }
        .domain { background: rgba(255,255,255,0.1); padding: 10px 20px; 
                  border-radius: 10px; margin: 20px 0; font-family: monospace; }
    </style>
</head>
<body>
    <div class="container">
        <h1>404</h1>
        <h2>${message}</h2>
        <p>您访问的域名页面暂时无法找到。</p>
        <div class="domain">${res.req?.headers?.host || '未知域名'}</div>
        <div>
            <a href="/" class="btn">返回首页</a>
            <a href="https://vercel.com" class="btn" target="_blank">技术支持</a>
        </div>
    </div>
</body>
</html>`;
  
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(404).send(notFoundHtml);
}

/**
 * 发送错误响应
 */
function sendError(res, statusCode, message) {
  res.setHeader('Cache-Control', 'no-cache');
  res.status(statusCode).json({
    error: true,
    code: statusCode,
    message: message,
    timestamp: new Date().toISOString()
  });
}
