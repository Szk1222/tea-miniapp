# 茶历方 Agent 服务
#
# 注意构建上下文是「项目根目录」而不是 server/，
# 因为服务端直接复用 ../data 与 ../utils 的知识源与规则引擎：
#   docker build -f server/Dockerfile -t chalifang-agent .
#   docker run -d -p 8787:8787 --env-file server/.env chalifang-agent

FROM node:20-alpine

WORKDIR /app

# 零运行时依赖，只需拷贝代码，不需要 npm install
COPY server/package.json ./server/package.json
COPY server/src ./server/src
COPY server/scripts ./server/scripts
# 管理后台页面（/admin）
COPY server/public ./server/public
COPY data ./data
COPY utils ./utils

# 内容库与审计日志目录。绑定挂载时宿主机目录权限要能被 uid 1000 写入，
# 否则请先在宿主机执行：mkdir -p server/storage && chown -R 1000:1000 server/storage
RUN mkdir -p /app/server/storage /app/server/.cache && chown -R node:node /app/server

ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0

EXPOSE 8787

# 健康检查打在 /health 上，编排器可据此做滚动发布
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8787)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# 以非 root 运行
USER node

CMD ["node", "server/src/index.js"]
