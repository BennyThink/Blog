FROM python:3.11-slim as pybuilder
RUN apt update && apt install -y gcc
COPY requirements.txt /requirements.txt
RUN pip3 install  --user -r /requirements.txt && rm /requirements.txt


FROM node:20-alpine as nodebuilder
WORKDIR /app
COPY pages/frontend/package.json /app/
COPY pages/frontend/package-lock.json /app/
RUN npm i
COPY pages/frontend /app/
RUN echo "GENERATE_SOURCEMAP=false" >> .env
RUN npm run build


FROM python:3.11-slim
WORKDIR /app
COPY pages/backend/ /app
COPY --from=pybuilder /root/.local /usr/local
COPY --from=nodebuilder /app/build /app/templates/
