FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY test ./test
COPY db ./db
COPY server.js ./server.js
RUN npm test
EXPOSE 3000
USER node
CMD ["node","server.js"]
