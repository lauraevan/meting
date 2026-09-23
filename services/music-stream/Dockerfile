FROM node:22-bookworm-slim
WORKDIR /app
COPY services/music-stream/server.js ./server.js
ADD https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp_linux /app/yt-dlp
RUN chmod +x /app/yt-dlp
ENV PORT=8080 YTDLP_PATH=/app/yt-dlp
EXPOSE 8080
CMD ["node", "server.js"]
