FROM node:gallium-alpine

RUN apk update
RUN apk add curl

WORKDIR /indexer

COPY package.json yarn.lock ./

RUN yarn

ADD . .

RUN yarn build

CMD yarn start
