# 🧬 Node.js 20 base
FROM node:20-slim

# 🛠 Install dependencies + Latest yt-dlp + FFmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# 📂 Set work directory
WORKDIR /app

# 📦 Install NPM deps
COPY package*.json ./
RUN npm install --omit=dev

# 🏠 Copy code
COPY . .

# 🚀 Start
EXPOSE 8080
CMD ["node", "server.js"]
