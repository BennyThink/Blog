#!/usr/bin/env python3
# coding: utf-8

import json
import logging
import os
import pathlib
import random
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import requests
import tornado.httpclient
from apscheduler.schedulers.background import BackgroundScheduler
from bs4 import BeautifulSoup
from tornado import escape, gen, httpserver, ioloop, options, web
from tornado.concurrent import run_on_executor
from tornado.log import enable_pretty_logging

DEBUG = True if os.uname().nodename == "Yogurt.lan" else False

enable_pretty_logging()
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s %(filename)s:%(lineno)d %(levelname).1s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

STATIC_PATH = pathlib.Path(__file__).parent.joinpath("templates")
escape.json_encode = lambda value: json.dumps(value, ensure_ascii=False, default=str)

if DEBUG:
    COUNTRY = {
        "US": {"currency": "USD", "name": "United States"},
        "HK": {"currency": "HKD", "name": "Hong Kong"},
        "TW": {"currency": "TWD", "name": "Taiwan"},
        "IN": {"currency": "INR", "name": "India"},
        "TR": {"currency": "TRY", "name": "Turkey"},
        "AG": {"currency": "XCD", "name": "Antigua And Barbuda"},
        "SE": {"currency": "SEK", "name": "Sweden"},
    }
else:
    COUNTRY = {
        "AD": {"currency": "EUR", "name": "Andorra"},
        "AE": {"currency": "AED", "name": "United Arab Emirates"},
        "AF": {"currency": "AFN", "name": "Afghanistan"},
        "AG": {"currency": "XCD", "name": "Antigua And Barbuda"},
        "AL": {"currency": "ALL", "name": "Albania"},
        "AM": {"currency": "AMD", "name": "Armenia"},
        "AO": {"currency": "AOA", "name": "Angola"},
        "AR": {"currency": "ARS", "name": "Argentina"},
        "AT": {"currency": "EUR", "name": "Austria"},
        "AU": {"currency": "AUD", "name": "Australia"},
        "AZ": {"currency": "AZN", "name": "Azerbaijan"},
        "BA": {"currency": "BAM", "name": "Bosnia And Herzegovina"},
        "BB": {"currency": "BBD", "name": "Barbados"},
        "BD": {"currency": "BDT", "name": "Bangladesh"},
        "BE": {"currency": "EUR", "name": "Belgium"},
        "BF": {"currency": "XOF", "name": "Burkina Faso"},
        "BG": {"currency": "BGN", "name": "Bulgaria"},
        "BH": {"currency": "BHD", "name": "Bahrain"},
        "BI": {"currency": "BIF", "name": "Burundi"},
        "BJ": {"currency": "XOF", "name": "Benin"},
        "BN": {"currency": "BND", "name": "Brunei Darussalam"},
        "BO": {"currency": "BOB", "name": "Bolivia"},
        "BR": {"currency": "BRL", "name": "Brazil"},
        "BS": {"currency": "BSD", "name": "Bahamas"},
        "BT": {"currency": "BTN", "name": "Bhutan"},
        "BW": {"currency": "BWP", "name": "Botswana"},
        "BY": {"currency": "BYN", "name": "Belarus"},
        "BZ": {"currency": "BZD", "name": "Belize"},
        "CA": {"currency": "CAD", "name": "Canada"},
        "CD": {"currency": "CDF", "name": "Congo, Democratic Republic"},
        "CF": {"currency": "XAF", "name": "Central African Republic"},
        "CG": {"currency": "XAF", "name": "Congo"},
        "CH": {"currency": "CHF", "name": "Switzerland"},
        "CI": {"currency": "XOF", "name": 'Cote D"Ivoire'},
        "CL": {"currency": "CLP", "name": "Chile"},
        "CM": {"currency": "XAF", "name": "Cameroon"},
        "CN": {"currency": "CNY", "name": "China"},
        "CO": {"currency": "COP", "name": "Colombia"},
        "CR": {"currency": "CRC", "name": "Costa Rica"},
        "CU": {"currency": "CUP", "name": "Cuba"},
        "CV": {"currency": "CVE", "name": "Cape Verde"},
        "CY": {"currency": "EUR", "name": "Cyprus"},
        "CZ": {"currency": "CZK", "name": "Czech Republic"},
        "DE": {"currency": "EUR", "name": "Germany"},
        "DJ": {"currency": "DJF", "name": "Djibouti"},
        "DK": {"currency": "DKK", "name": "Denmark"},
        "DM": {"currency": "XCD", "name": "Dominica"},
        "DO": {"currency": "DOP", "name": "Dominican Republic"},
        "DZ": {"currency": "DZD", "name": "Algeria"},
        "EC": {"currency": "USD", "name": "Ecuador"},
        "EE": {"currency": "EUR", "name": "Estonia"},
        "EG": {"currency": "EGP", "name": "Egypt"},
        "ER": {"currency": "ERN", "name": "Eritrea"},
        "ES": {"currency": "EUR", "name": "Spain"},
        "ET": {"currency": "ETB", "name": "Ethiopia"},
        "FI": {"currency": "EUR", "name": "Finland"},
        "FJ": {"currency": "FJD", "name": "Fiji"},
        "FM": {"currency": "USD", "name": "Micronesia, Federated States Of"},
        "FR": {"currency": "EUR", "name": "France"},
        "GA": {"currency": "XAF", "name": "Gabon"},
        "GB": {"currency": "GBP", "name": "United Kingdom"},
        "GD": {"currency": "XCD", "name": "Grenada"},
        "GE": {"currency": "GEL", "name": "Georgia"},
        "GH": {"currency": "GHS", "name": "Ghana"},
        "GM": {"currency": "GMD", "name": "Gambia"},
        "GN": {"currency": "GNF", "name": "Guinea"},
        "GQ": {"currency": "XAF", "name": "Equatorial Guinea"},
        "GR": {"currency": "EUR", "name": "Greece"},
        "GT": {"currency": "GTQ", "name": "Guatemala"},
        "GW": {"currency": "XOF", "name": "Guinea-Bissau"},
        "GY": {"currency": "GYD", "name": "Guyana"},
        "HK": {"currency": "HKD", "name": "Hong Kong"},
        "HN": {"currency": "HNL", "name": "Honduras"},
        "HR": {"currency": "HRK", "name": "Croatia"},
        "HT": {"currency": "HTG", "name": "Haiti"},
        "HU": {"currency": "HUF", "name": "Hungary"},
        "ID": {"currency": "IDR", "name": "Indonesia"},
        "IE": {"currency": "EUR", "name": "Ireland"},
        "IL": {"currency": "ILS", "name": "Israel"},
        "IN": {"currency": "INR", "name": "India"},
        "IQ": {"currency": "IQD", "name": "Iraq"},
        "IR": {"currency": "IRR", "name": "Iran, Islamic Republic Of"},
        "IS": {"currency": "ISK", "name": "Iceland"},
        "IT": {"currency": "EUR", "name": "Italy"},
        "JM": {"currency": "JMD", "name": "Jamaica"},
        "JO": {"currency": "JOD", "name": "Jordan"},
        "JP": {"currency": "JPY", "name": "Japan"},
        "KE": {"currency": "KES", "name": "Kenya"},
        "KG": {"currency": "KGS", "name": "Kyrgyzstan"},
        "KH": {"currency": "KHR", "name": "Cambodia"},
        "KI": {"currency": "AUD", "name": "Kiribati"},
        "KM": {"currency": "KMF", "name": "Comoros"},
        "KN": {"currency": "XCD", "name": "Saint Kitts And Nevis"},
        "KW": {"currency": "KWD", "name": "Kuwait"},
        "KZ": {"currency": "KZT", "name": "Kazakhstan"},
        "LA": {"currency": "LAK", "name": 'Lao People"s Democratic Republic'},
        "LB": {"currency": "LBP", "name": "Lebanon"},
        "LC": {"currency": "XCD", "name": "Saint Lucia"},
        "LI": {"currency": "CHF", "name": "Liechtenstein"},
        "LK": {"currency": "LKR", "name": "Sri Lanka"},
        "LR": {"currency": "LRD", "name": "Liberia"},
        "LS": {"currency": "LSL", "name": "Lesotho"},
        "LT": {"currency": "EUR", "name": "Lithuania"},
        "LU": {"currency": "EUR", "name": "Luxembourg"},
        "LV": {"currency": "EUR", "name": "Latvia"},
        "LY": {"currency": "LYD", "name": "Libyan Arab Jamahiriya"},
        "MA": {"currency": "MAD", "name": "Morocco"},
        "MC": {"currency": "EUR", "name": "Monaco"},
        "MD": {"currency": "MDL", "name": "Moldova"},
        "ME": {"currency": "EUR", "name": "Montenegro"},
        "MG": {"currency": "MGA", "name": "Madagascar"},
        "MH": {"currency": "USD", "name": "Marshall Islands"},
        "MK": {"currency": "MKD", "name": "Macedonia"},
        "ML": {"currency": "XOF", "name": "Mali"},
        "MM": {"currency": "MMK", "name": "Myanmar"},
        "MN": {"currency": "MNT", "name": "Mongolia"},
        "MO": {"currency": "MOP", "name": "Macao"},
        "MR": {"currency": "MRU", "name": "Mauritania"},
        "MT": {"currency": "EUR", "name": "Malta"},
        "MU": {"currency": "MUR", "name": "Mauritius"},
        "MV": {"currency": "MVR", "name": "Maldives"},
        "MW": {"currency": "MWK", "name": "Malawi"},
        "MX": {"currency": "MXN", "name": "Mexico"},
        "MY": {"currency": "MYR", "name": "Malaysia"},
        "MZ": {"currency": "MZN", "name": "Mozambique"},
        "NA": {"currency": "NAD", "name": "Namibia"},
        "NE": {"currency": "XOF", "name": "Niger"},
        "NG": {"currency": "NGN", "name": "Nigeria"},
        "NI": {"currency": "NIO", "name": "Nicaragua"},
        "NL": {"currency": "EUR", "name": "Netherlands"},
        "NO": {"currency": "NOK", "name": "Norway"},
        "NP": {"currency": "NPR", "name": "Nepal"},
        "NR": {"currency": "AUD", "name": "Nauru"},
        "NZ": {"currency": "NZD", "name": "New Zealand"},
        "OM": {"currency": "OMR", "name": "Oman"},
        "PA": {"currency": "PAB", "name": "Panama"},
        "PE": {"currency": "PEN", "name": "Peru"},
        "PG": {"currency": "PGK", "name": "Papua New Guinea"},
        "PH": {"currency": "PHP", "name": "Philippines"},
        "PK": {"currency": "PKR", "name": "Pakistan"},
        "PL": {"currency": "PLN", "name": "Poland"},
        "PS": {"currency": "ILS", "name": "Palestinian Territory, Occupied"},
        "PT": {"currency": "EUR", "name": "Portugal"},
        "PW": {"currency": "USD", "name": "Palau"},
        "PY": {"currency": "PYG", "name": "Paraguay"},
        "QA": {"currency": "QAR", "name": "Qatar"},
        "RO": {"currency": "RON", "name": "Romania"},
        "RS": {"currency": "RSD", "name": "Serbia"},
        "RU": {"currency": "RUB", "name": "Russian Federation"},
        "RW": {"currency": "RWF", "name": "Rwanda"},
        "SA": {"currency": "SAR", "name": "Saudi Arabia"},
        "SB": {"currency": "SBD", "name": "Solomon Islands"},
        "SC": {"currency": "SCR", "name": "Seychelles"},
        "SD": {"currency": "SDG", "name": "Sudan"},
        "SE": {"currency": "SEK", "name": "Sweden"},
        "SG": {"currency": "SGD", "name": "Singapore"},
        "SI": {"currency": "EUR", "name": "Slovenia"},
        "SK": {"currency": "EUR", "name": "Slovakia"},
        "SL": {"currency": "SLL", "name": "Sierra Leone"},
        "SM": {"currency": "EUR", "name": "San Marino"},
        "SN": {"currency": "XOF", "name": "Senegal"},
        "SO": {"currency": "SOS", "name": "Somalia"},
        "SR": {"currency": "SRD", "name": "Suriname"},
        "SS": {"currency": "SSP", "name": "Unknown"},
        "ST": {"currency": "STN", "name": "Sao Tome And Principe"},
        "SV": {"currency": "USD", "name": "El Salvador"},
        "SY": {"currency": "SYP", "name": "Syrian Arab Republic"},
        "SZ": {"currency": "SZL", "name": "Swaziland"},
        "TD": {"currency": "XAF", "name": "Chad"},
        "TG": {"currency": "XOF", "name": "Togo"},
        "TH": {"currency": "THB", "name": "Thailand"},
        "TJ": {"currency": "TJS", "name": "Tajikistan"},
        "TL": {"currency": "USD", "name": "Timor-Leste"},
        "TM": {"currency": "TMT", "name": "Turkmenistan"},
        "TN": {"currency": "TND", "name": "Tunisia"},
        "TO": {"currency": "TOP", "name": "Tonga"},
        "TR": {"currency": "TRY", "name": "Turkey"},
        "TT": {"currency": "TTD", "name": "Trinidad And Tobago"},
        "TV": {"currency": "AUD", "name": "Tuvalu"},
        "TW": {"currency": "TWD", "name": "Taiwan"},
        "TZ": {"currency": "TZS", "name": "Tanzania"},
        "UA": {"currency": "UAH", "name": "Ukraine"},
        "UG": {"currency": "UGX", "name": "Uganda"},
        "US": {"currency": "USD", "name": "United States"},
        "UY": {"currency": "UYU", "name": "Uruguay"},
        "UZ": {"currency": "UZS", "name": "Uzbekistan"},
        "VA": {"currency": "EUR", "name": "Holy See (Vatican City State)"},
        "VC": {"currency": "XCD", "name": "Saint Vincent And Grenadines"},
        "VE": {"currency": "VES", "name": "Venezuela"},
        "VN": {"currency": "VND", "name": "Vietnam"},
        "VU": {"currency": "VUV", "name": "Vanuatu"},
        "WS": {"currency": "WST", "name": "Samoa"},
        "XK": {"currency": "EUR", "name": "Unknown"},
        "YE": {"currency": "YER", "name": "Yemen"},
        "ZA": {"currency": "ZAR", "name": "South Africa"},
        "ZM": {"currency": "ZMW", "name": "Zambia"},
        "ZW": {"currency": "ZWL", "name": "Zimbabwe"},
    }
BASE_URL = "https://tv.apple.com/"
DATA = {
    "prices": [],
    "progress": 0.0,
    "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC"),
}


def fetch_data():
    logging.info("Starting to fetch data from Apple TV+...")
    for code, meta in COUNTRY.items():
        time.sleep(random.random())
        logging.info("Fetching %s", meta["name"])
        text = requests.get(
            BASE_URL + code,
            headers={
                "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
            },
        ).content.decode("u8")

        soup = BeautifulSoup(text, "html.parser")
        r = soup.find(id="shoebox-uts-api")
        if r is None:
            logging.warning("Apple TV+ is not available in %s", meta["name"])
            continue
        data = json.loads(r.get_text())
        if not data:
            continue
        offer = data["/uts/v3/canvases/channels/tvs.sbd.4000"]["upsellOffers"]["tvs.sbd.4000"]["commerceOffers"][0]
        if offer["priceForDisplay"].startswith("US$"):
            logging.warning("%s doesn't have local price", meta["name"])
            usd_price = offer["price"]
        else:
            logging.info("Converting %s %s to USD", offer["price"], meta["currency"])
            endpoint = "https://v6.exchangerate-api.com/v6/4898f6159879e769eb482231/pair/{currency}/USD/{amount}".format(
                currency=meta["currency"],
                amount=offer["price"],
            )
            usd_price = round(requests.get(endpoint).json()["conversion_result"], 2)

        DATA["progress"] = len(DATA["prices"]) / len(COUNTRY) * 100
        DATA["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC")
        logging.info("Adding %s to the list", meta["name"])
        DATA["prices"].append(
            {
                "code": code,
                "name": meta["name"],
                "local_price": offer["priceForDisplay"],
                "currency": meta["currency"],
                "usd_price": usd_price,
            }
        )


class BaseHandler(web.RequestHandler):
    executor = ThreadPoolExecutor(200)

    def __init__(self, application, request, **kwargs):
        super().__init__(application, request, **kwargs)
        try:
            self.json: dict = json.loads(self.request.body)
        except json.decoder.JSONDecodeError:
            self.json = {}


class IndexHandler(BaseHandler):
    @run_on_executor()
    def get_index(self):
        with open(STATIC_PATH.joinpath("index.html"), encoding="u8") as f:
            html = f.read()
        return html

    @gen.coroutine
    def get(self):
        resp = yield self.get_index()
        self.write(resp)


class AppleTVPlusHandler(BaseHandler):
    @run_on_executor()
    def get_index(self):
        return DATA

    @gen.coroutine
    def get(self):
        resp = yield self.get_index()
        self.write(resp)


class RunServer:
    handlers = [
        (r"/", IndexHandler),
        (r"/api/apple-tv-plus", AppleTVPlusHandler),
        (
            r"/(.*\.html|.*\.js|.*\.css|.*\.png|.*\.jpg|.*\.ico|.*\.gif|.*\.woff2|.*\.svg|.*\.json|.*\.txt)",
            web.StaticFileHandler,
            {"path": STATIC_PATH},
        ),
    ]
    settings = {
        "template_path": "templates",
        "default_handler_class": IndexHandler,
    }
    application = web.Application(handlers, **settings)

    @staticmethod
    def run_server(port, host):
        tornado_server = httpserver.HTTPServer(RunServer.application, xheaders=True)
        tornado_server.bind(port, host)
        if DEBUG:
            logging.info("Running in development mode")
            tornado_server.start(1)
            tornado.autoreload.start()
        else:
            tornado_server.start(0)

        try:
            print("Server is running on http://{}:{}".format(host, port))
            ioloop.IOLoop.instance().current().start()
        except KeyboardInterrupt:
            ioloop.IOLoop.instance().stop()
            print('"Ctrl+C" received, exiting.\n')


if __name__ == "__main__":
    scheduler = BackgroundScheduler()
    scheduler.add_job(fetch_data, "cron", day_of_week="mon", hour=0)
    scheduler.start()
    threading.Thread(target=fetch_data).start()
    options.define("p", default=20080, help="running port", type=int)
    options.define("h", default="127.0.0.1", help="listen address", type=str)
    options.parse_command_line()
    p = options.options.p
    h = options.options.h
    RunServer.run_server(port=p, host=h)
