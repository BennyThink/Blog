#!/bin/bash

mkdir www
mkdir  ./certs
cat /etc/ssl/certs/dhparam.pem > ./certs/dhparam.pem
cat /etc/ssl/cf/dmesg_cf_cert.pem > ./certs/dmesg.app/fullchain.pem
cat /etc/ssl/cf/dmesg_cf_key.pem > ./certs/dmesg.app/privkey.pem