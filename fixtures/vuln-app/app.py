"""Toy web app — deliberately weak patterns for scanner testing. NOT runnable in prod."""

import ast
import operator
import subprocess

import requests
import yaml
from flask import Flask, request

app = Flask(__name__)

DB_PASSWORD = "hunter2"  # fixture: hardcoded credential (fake)

# ---------------------------------------------------------------------------
# Safe arithmetic evaluator — replaces eval() on the /calc route.
# Only numeric literals and the operators +  -  *  /  (and unary +/-) are
# allowed.  Everything else (calls, attributes, imports …) raises ValueError.
# ---------------------------------------------------------------------------
_ALLOWED_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}


def _safe_eval(expr: str):
    """Evaluate a simple arithmetic expression; raise ValueError if unsafe."""
    try:
        tree = ast.parse(expr, mode="eval")
    except SyntaxError as exc:
        raise ValueError(f"Invalid expression: {exc}") from exc

    def _eval(node):
        if isinstance(node, ast.Expression):
            return _eval(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in _ALLOWED_OPS:
            return _ALLOWED_OPS[type(node.op)](_eval(node.left), _eval(node.right))
        if isinstance(node, ast.UnaryOp) and type(node.op) in _ALLOWED_OPS:
            return _ALLOWED_OPS[type(node.op)](_eval(node.operand))
        raise ValueError(f"Disallowed expression node: {ast.dump(node)}")

    return _eval(tree)


@app.route("/calc")
def calc():
    expr = request.args.get("expr", "1+1")
    try:
        result = _safe_eval(expr)
    except (ValueError, ZeroDivisionError) as exc:
        return str(exc), 400
    return str(result)


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
