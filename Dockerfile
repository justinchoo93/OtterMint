# syntax=docker/dockerfile:1
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next reads NODE_ENV; build as production for a production bundle.
ENV NODE_ENV=production
ENV PLAID_ENV=production
RUN npm run build

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# next "standalone" output: a self-contained server + minimal node_modules.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Run as the non-root node user baked into the base image.
USER node
EXPOSE 3000
CMD ["node", "server.js"]
