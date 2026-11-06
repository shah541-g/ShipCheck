FROM node:24-bookworm-slim
# Docker CLI only (no daemon): the api starts sandbox containers through the host's docker.sock.
COPY --from=docker:27-cli /usr/local/bin/docker /usr/local/bin/docker
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts ./scripts
EXPOSE 4000
# Runs as root inside the container because it needs the Docker socket. It never runs page content.
CMD ["node", "src/server.js"]
