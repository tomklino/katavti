FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY server ./server
RUN npm run build:server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY config-defaults.yaml ./config-defaults.yaml
EXPOSE 3030
CMD ["npm", "start"]
