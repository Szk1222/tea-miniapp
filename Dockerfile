# 微信云托管 GitHub 部署：目标目录为仓库根目录，Dockerfile 名称为 Dockerfile。
# 后端复用根目录的 data/ 和 utils/，因此不能把目标目录设成 server/。
FROM node:20-alpine

WORKDIR /app

COPY server/package.json ./server/package.json
COPY server/src ./server/src
COPY server/scripts ./server/scripts
COPY server/public ./server/public
COPY data ./data
COPY utils ./utils

RUN mkdir -p /app/server/storage /app/server/.cache && chown -R node:node /app/server

ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8787)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

USER node
CMD ["node", "server/src/index.js"]
