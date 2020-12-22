#!/bin/bash

mkdir www
mkdir -p ./certs/dmesg.app
cat /etc/ssl/certs/dhparam.pem > ./certs/dhparam.pem
cat /etc/letsencrypt/live/dmesg.app/fullchain.pem > ./certs/dmesg.app/fullchain.pem
cat /etc/letsencrypt/live/dmesg.app/privkey.pem > ./certs/dmesg.app/privkey.pem