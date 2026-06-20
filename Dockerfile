FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install --ignore-scripts

COPY . .

ARG VITE_HOSTED_DEMO=true
ENV VITE_HOSTED_DEMO=${VITE_HOSTED_DEMO}

RUN npm run build

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=7860
ENV HF_SPACES=true
ENV DISABLE_AUTO_SETUP=true
ENV DEFAULT_WHISPER_MODEL=tiny
ENV MAX_ACTIVE_TRANSCRIPTIONS=3
ENV MAX_QUEUE_SIZE=3
ENV MAX_WS_CONNECTIONS=6
ENV VITE_HOSTED_DEMO=true

COPY package*.json ./
RUN npm install --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/server ./server
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

EXPOSE 7860

CMD ["npm", "run", "preview"]
