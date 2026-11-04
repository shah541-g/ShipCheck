FROM mcr.microsoft.com/playwright:v1.64.1-noble

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    NODE_ENV=production \
    HOME=/tmp

WORKDIR /runner
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY runner.js ./

USER pwuser
ENTRYPOINT ["node", "runner.js"]
