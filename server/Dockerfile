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
COPY data ./data
COPY utils ./utils

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
