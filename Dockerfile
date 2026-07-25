FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl zstd \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://ollama.com/install.sh | sh

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV OLLAMA_HOST=http://127.0.0.1:11434
ENV TRANSCRIBE_EASY_SETUP_MODE=docker
ENV DEFAULT_WHISPER_MODEL=base
ENV REQUIRED_OLLAMA_MODELS=qwen3.5:0.8b
ENV OPTIONAL_OLLAMA_MODELS=qwen3.5:2b
ENV REQUIRED_WHISPER_MODELS=tiny,base

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/server ./server
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

RUN chmod +x ./scripts/docker-entrypoint.sh

VOLUME ["/root/.ollama", "/root/.transcribe-easy"]

EXPOSE 3000

ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
