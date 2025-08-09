FROM node:18-alpine

# 安裝 ffmpeg (node-media-server 需要)
RUN apk add --no-cache ffmpeg

# 設定工作目錄
WORKDIR /app

# 複製並安裝依賴
COPY package*.json ./
RUN npm install

# 複製程式碼
COPY socketio-cloud-server.js ./

# 建立 public 目錄（如果需要）
RUN mkdir -p public

# 開放端口
EXPOSE 3000 1935 8888

# 啟動應用程式
CMD ["npm", "start"]