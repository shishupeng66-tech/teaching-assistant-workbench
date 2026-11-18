"""受控数据校验，不执行题干、来源脚本或表达式。"""

import re
import unicodedata
from collections import Counter
from fractions import Fraction
from math import gcd, prod

MASS = {
    "H": 1,
    "C": 12,
    "O": 16,
    "Ca": 40,
    "Na": 23,
    "Cl": 35.5,
    "Mg": 24,
    "N": 14,
    "Fe": 56,
    "K": 39,
    "S": 32,
}


def atoms(formula):
    tokens = re.findall(r"[A-Z][a-z]?|\d+|[()]", formula)
    if "".join(tokens) != formula:
        raise ValueError("化学式含未知字符")
    stack = [Counter()]
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t == "(":
            stack.append(Counter())
            i += 1
            continue
        if t == ")":
            if len(stack) == 1:
                raise ValueError("括号不匹配")
            value = stack.pop()
            i += 1
        elif t in MASS:
            value = Counter({t: 1})
            i += 1
        else:
            raise ValueError("未知元素或格式")
        count = 1
        if i < len(tokens) and tokens[i].isdigit():
            count = int(tokens[i])
            i += 1
        if count <= 0:
            raise ValueError("原子数无效")
        stack[-1].update({k: v * count for k, v in value.items()})
    if len(stack) != 1:
        raise ValueError("括号不匹配")
    return stack[0]


def mass(f):
    return sum(Fraction(str(MASS[k])) * n for k, n in atoms(f).items())


def side(values):
    result = Counter()
    for f, n in values.items():
        result.update({k: v * n for k, v in atoms(f).items()})
    return result


def calculate(c):
    op = c["op"]
    v = [Fraction(str(x)) for x in c.get("values", [])]
    if op == "balance":
        assert side(c["left"]) == side(c["right"])
        return None
    if op == "stoich":
        assert side(c["left"]) == side(c["right"])
        coeff = {**c["left"], **c["right"]}
        return (
            Fraction(str(c["given_mass"]))
            / mass(c["given_formula"])
            / coeff[c["given_formula"]]
            * coeff[c["target_formula"]]
            * mass(c["target_formula"])
        )
    if op == "ratio":
        a, b = map(int, v)
        g = gcd(a, b)
        return [a // g, b // g]
    if op == "formula_mass":
        return mass(c["formula"])
    if op == "equality":
        return Fraction(str(c["value"]))
    if op == "product":
        return prod(v)
    if op == "sum":
        return sum(v)
    if op == "mean":
        return sum(v) / len(v)
    if op == "difference":
        return v[0] - v[1]
    if op == "quotient":
        return v[0] / v[1]
    if op == "fraction_product":
        return v[0] * v[1] / v[2]
    if op == "difference_percent":
        return (v[0] - v[1]) / v[0] * 100
    if op == "difference_product":
        return (v[0] - v[1]) * v[2]
    if op == "dilution":
        return (
            Fraction(c["initial_mass"])
            * Fraction(c["initial_percent"])
            / c["final_percent"]
            - c["initial_mass"]
        )
    raise ValueError("不支持的校验类型")


def displayed_equations(text):
    text = (
        unicodedata.normalize("NFKC", text)
        .replace("＋", "+")
        .replace("↑", "")
        .replace("↓", "")
        .replace(" ", "")
    )
    formula = r"(?:[A-Z][a-z]?\d*|\([A-Za-z0-9]+\)\d*)+"
    term = r"\d*" + formula
    expr = term + r"(?:\+" + term + r")*"

    def parse(value):
        result = {}
        for term in value.split("+"):
            match = re.fullmatch(r"(\d*)(.+)", term)
            coefficient = int(match[1] or 1)
            assert coefficient > 0
            result[match[2]] = result.get(match[2], 0) + coefficient
        return result

    return [
        (parse(m[1]), parse(m[2]))
        for m in re.finditer("(" + expr + ")→(" + expr + ")", text)
    ]


def validate(data):
    names = set()
    codes = set()
    ids = set()
    stems = set()
    checks = 0
    equations = 0
    for p in data["points"]:
        assert p["name"] not in names and p["code"] not in codes and p["id"] not in ids
        names.add(p["name"])
        codes.add(p["code"])
        ids.add(p["id"])
        assert p["definition"] and p["requirements"] and p["mastery"] and p["node_ids"]
        assert len(p["questions"]) == 3
        for q in p["questions"]:
            assert q["id"] not in ids
            ids.add(q["id"])
            assert (
                all(q[k].strip() for k in ("prompt", "answer", "explanation"))
                and 1 <= q["difficulty"] <= 5
            )
            stem = re.sub(r"\W", "", unicodedata.normalize("NFKC", q["prompt"]))
            assert stem not in stems, q["code"]
            stems.add(stem)
            if q["type"] == "单选题":
                assert (
                    len(q["options"]) == len(set(q["options"])) == 4
                    and q["answer"] in "ABCD"
                    and len(q["answer"]) == 1
                )
            c = q.get("check")
            if c:
                result = calculate(c)
                checks += 1
                if c["op"] == "balance":
                    equations += 1
                    answer = unicodedata.normalize(
                        "NFKC", q["answer"] + " " + q["prompt"]
                    )
                    actual = displayed_equations(answer)
                    assert any(
                        left == c["left"] and right == c["right"]
                        for left, right in actual
                    ), q["code"]
                    # 实际展示的配平方程式也必须守恒，不只校验旁置描述。
                    # 题干可含待配平表达式，因此只对最终答案中的反应式作全量检查。
                    for left, right in displayed_equations(q["answer"]):
                        assert side(left) == side(right), q["code"]
                elif c["op"] == "ratio":
                    assert (
                        result == c["expected"]
                        and "∶".join(map(str, result)) in q["answer"]
                    )
                else:
                    value = round(float(result), c["round"]) if "round" in c else result
                    assert Fraction(str(value)) == Fraction(c["expected"]), q["code"]
                    # 数值必须实际出现在答案里，不能仅校验旁置元数据。
                    assert re.search(
                        r"(?<![\d.])" + re.escape(c["expected"]) + r"(?![\d.])",
                        q["answer"],
                    ), q["code"]
    return {
        "points": len(names),
        "questions": len(stems),
        "controlled_checks": checks,
        "balanced_equations": equations,
        "teacher_review": "pending",
    }
