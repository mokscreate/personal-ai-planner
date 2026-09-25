FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && mkdir -p /var/data && chown node:node /var/data
ENV NODE_ENV=production PORT=4317 PLANNER_CLOUD=1 PLANNER_DATA_DIR=/var/data TZ=Asia/Shanghai
USER node
EXPOSE 4317
CMD ["node", "--import", "tsx", "server/index.ts"]
