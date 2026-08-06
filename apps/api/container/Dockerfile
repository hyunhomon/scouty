FROM oven/bun:1.3.14-debian

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates imagemagick poppler-utils webp \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN bun install --production
COPY server.ts ./

USER bun
EXPOSE 8080
CMD ["bun", "run", "server.ts"]
