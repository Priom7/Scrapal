"""Rank Python functions by length and branch count.

    .venv/bin/python scripts/rank-complexity.py [path] [top-n]

Used to pick refactor targets: a long, heavily branched function that is also
thinly covered is where a rewrite is most likely to be needed and least likely
to be safe. Pair the output with `pytest --cov` before touching anything.
"""

import ast
import pathlib
import sys

BRANCHING = (ast.If, ast.For, ast.While, ast.Try, ast.ExceptHandler, ast.BoolOp)


def main() -> None:
    root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "src")
    top = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    rows = []
    for path in sorted(root.rglob("*.py")):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            lines = (node.end_lineno or node.lineno) - node.lineno + 1
            branches = sum(isinstance(child, BRANCHING) for child in ast.walk(node))
            rows.append((lines, branches, f"{path}:{node.lineno}", node.name))
    rows.sort(reverse=True)
    print(f"{'lines':>5} {'branch':>6}  location")
    for lines, branches, location, name in rows[:top]:
        print(f"{lines:5} {branches:6}  {location}  {name}()")


if __name__ == "__main__":
    main()
