"""Toy web app — deliberately weak patterns for scanner testing. NOT runnable in prod."""

import subprocess

import requests
import yaml
from flask import Flask, request

app = Flask(__name__)

DB_PASSWORD = "hunter2"  # fixture: hardcoded credential (fake)


@app.route("/calc")
def calc():
    expr = request.args.get("expr", "1+1")
    return str(eval(expr))  # fixture: eval on user input


@app.route("/ping")
def ping():
    host = request.args.get("host", "localhost")
    out = subprocess.check_output("ping -n 1 " + host, shell=True)  # fixture: shell injection
    return out


@app.route("/load")
def load():
    doc = request.args.get("doc", "")
    return str(yaml.load(doc))  # fixture: unsafe yaml load


@app.route("/fetch")
def fetch():
    return requests.get("https://internal.example.com", verify=False).text  # fixture: TLS off


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True)  # fixture: debug + all interfaces
