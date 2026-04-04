# 🧬 Use a stable Node.js image
FROM node:20-slim

# 🛠 Install Python3, FFmpeg, and other deps directly in the OS
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# 📂 Set work directory inside container
WORKDIR /app

# 📦 Copy package logs first for speed/caching
COPY package*.json ./
RUN npm install --omit=dev

# 🏠 Copy the rest of the backend files
COPY . .

# 🚀 Start the server
EXPOSE 8080
CMD ["node", "server.js"]
