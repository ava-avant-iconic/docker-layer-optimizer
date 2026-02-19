FROM ubuntu:22.04

RUN apt-get update
RUN apt-get install -y nodejs npm curl

WORKDIR /app

COPY . .

RUN npm install

ENV NODE_ENV=production

CMD ["node", "index.js"]
