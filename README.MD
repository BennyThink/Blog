
dmesg.app docker-compose

mkdir ./certs/dmesg.app
cat /etc/ssl/certs/dhparam.pem > ./certs/dmesg.app/dhparam.pem
cat /etc/letsencrypt/live/dmesg.app/fullchain.pem > ./certs/dmesg.app/fullchain.pem
cat /etc/letsencrypt/live/dmesg.app/privkey.pem > ./certs/dmesg.app/privkey.pem
