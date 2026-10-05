FROM node:24-alpine
WORKDIR /app
COPY server/math-server.mjs ./server/math-server.mjs
COPY data/math/lessons.json ./data/math/lessons.json
ENV HOST=0.0.0.0 PORT=8787 MATH_DATA_DIR=/data
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8787
CMD ["node", "server/math-server.mjs"]
