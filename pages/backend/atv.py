import requests
import json
from bs4 import BeautifulSoup

base_url = "https://tv.apple.com/"

code = {"se": "sek", "us": "usd", "ag": "ars", "vn": ""}


for k, v in code.items():
    text = requests.get(
        base_url + k,
        headers={
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
        },
    ).text

    soup = BeautifulSoup(text, "html.parser")
    r = soup.find(id="shoebox-uts-api")
    data = json.loads(r.get_text())
    offer = data["/uts/v3/canvases/channels/tvs.sbd.4000"]["upsellOffers"]["tvs.sbd.4000"]["commerceOffers"][0]
    print(offer["price"], offer["priceForDisplay"])
