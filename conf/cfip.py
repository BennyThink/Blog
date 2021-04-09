#!/usr/local/bin/python3
# coding: utf-8

# WebsiteRunner - cfip.py
# 4/9/21 20:47
#

__author__ = "Benny <benny.think@gmail.com>"

import requests

v4 = requests.get("https://www.cloudflare.com/ips-v4").text
v6 = requests.get("https://www.cloudflare.com/ips-v6").text
config = ""
v4_geo = ""
v6_geo = ""
for item in v4.split():
    directive = f"set_real_ip_from {item};\n"
    v4_geo += f"{item}  1;\n"
    config += directive
config += "\n"
for item in v6.split():
    directive = f"set_real_ip_from {item};\n"
    v6_geo += f"{item}  1;\n"
    config += directive

bottom = "real_ip_header CF-Connecting-IP;"
config += "\n" + bottom

with open("cloudflare.conf", "w")as f:
    f.write(config)

only_cf = f"""
geo $realip_remote_addr $cloudflare_ip {{
    default          0;
    {v4_geo}
    {v6_geo}
}}
"""
# reference : https://serverfault.com/questions/601339/how-do-i-deny-all-requests-not-from-cloudflare

#
# for i in `curl https://www.cloudflare.com/ips-v4`; do ufw from $i to any port 80; done
# with open("block_non_cf.conf","w") as f:
#     f.write(only_cf)
