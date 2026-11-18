import copy

"""离线编制数据，不接触数据库；catalog-snapshot.json来自本项目真实目录。"""

import json, re, hashlib
from pathlib import Path
from uuid import uuid5, NAMESPACE_URL
from authoring import POINTS

ROOT = Path(__file__).resolve().parent
ALIASES = {
    "课题2 认识酸碱盐的性质及应用": "课题2 认识酸、碱、盐的性质与应用",
    "课题1 燃烧与燃料": "课题1 认识燃烧与燃料",
    "课题1 化学引领新能源开发": "课题1 化学引领新能源的开发",
    "课题3 化学提供丰富多样的材料": "课题3 化学为人类提供丰富的材料",
    "跨学科实践活动1 生活垃圾的分类与回收利用": "跨学科实践活动 生活垃圾的分类与回收利用",
    "跨学科实践活动2 设计并制作微型空气质量检测站": "跨学科实践活动 微型空气质量“检测站”的组装与使用",
    "跨学科实践活动3 设计简易供氧器": "跨学科实践活动 基于特定需求设计和制作简易供氧器",
    "跨学科实践活动4 水质检测及自制净水器": "跨学科实践活动 水质检测及自制净水器",
    "跨学科实践活动5 认识模型，感悟科学史": "跨学科实践活动 制作模型并展示科学家探索物质组成与结构的历程",
    "跨学科实践活动6 了解碳中和，争做低碳少年": "跨学科实践活动 基于碳中和理念设计低碳行动方案",
    "跨学科实践活动7 从海洋资源中获取食盐": "跨学科实践活动 海洋资源的综合利用与制盐",
    "跨学科实践活动8 探究土壤的酸碱性对植物生长的影响": "跨学科实践活动 探究土壤酸碱性对植物生长的影响",
    "跨学科实践活动9 调查家用燃料的变迁": "跨学科实践活动 调查家用燃料的变迁与合理使用",
    "跨学科实践活动10 寻找我国航天成就中的化学贡献": "跨学科实践活动 调查我国航天科技领域中新型材料、新型能源的应用",
}


def uid(code):
    return uuid5(
        NAMESPACE_URL,
        "teaching-assistant-workbench/textbook-chemistry/2026-11-v1/" + code,
    ).hex


def build():
    points = copy.deepcopy(POINTS)
    c = json.loads((ROOT / "catalog-snapshot.json").read_text())
    nodes = c["nodes"]
    byid = {n["id"]: n for n in nodes}

    def lookup(name):
        matches = [n for n in nodes if n["name"] == name]
        assert len(matches) == 1, name
        return matches[0]

    for p in points:
        n = lookup(ALIASES.get(p["node"], p["node"]))
        p["node"] = n["name"]
        p["id"] = uid(p["code"])
        p["node_ids"] = [n["id"]]
        parent = byid[n["parent_id"]]
        # 专题复习复用本专题实体，候选关联仍需教师确认。
        reviews = [
            x
            for x in nodes
            if x["parent_id"] == parent["id"] and x["name"] == "专题复习"
        ]
        p["node_ids"] += [x["id"] for x in reviews]
        p["source"] = (
            "AI辅助原创教学草案；待教师审核。范围参照义务教育化学课程标准（2022年版）；教材课题来自现有目录，非教材正文摘录。"
        )
        theme = parent
        if theme["parent_id"]:
            theme = byid[theme["parent_id"]]
        p["theme_id"] = theme["id"]
        p["theme_name"] = theme["name"]
        p["standard_scope"] = next(
            label
            for limit, label in [
                (2, "物质的化学变化：变化与性质"),
                (4, "物质的组成与结构：物质组成的表示"),
                (8, "科学探究与化学实验：实验技能与探究方法"),
                (14, "物质的性质与应用：常见气体"),
                (20, "物质的性质与应用：水及常见溶液"),
                (26, "物质的组成与结构：微观构成与元素"),
                (30, "物质的化学变化：质量守恒与反应表示"),
                (36, "物质的性质与应用：溶液及组成"),
                (42, "物质的性质与应用：酸碱盐"),
                (48, "物质的化学变化：反应条件与调控"),
                (64, "化学与社会·跨学科实践"),
            ]
            if int(p["code"][3:]) <= limit
        )
        for i, q in enumerate(p["questions"], 1):
            q["id"] = uid(p["code"] + f"-Q{i}")
            q["code"] = p["code"] + f"-Q{i}"
            if q.get("options"):
                old = ord(q["answer"]) - 65
                shift = (int(p["code"][3:]) + i) % 4
                q["options"] = q["options"][shift:] + q["options"][:shift]
                q["answer"] = chr(65 + (old - shift) % 4)
    # 附录作为实验、信息查读的辅助复习，不冒充教材原文覆盖。
    for p in points:
        if p["code"] in ("SHC005", "SHC006", "SHC024"):
            p["node_ids"].append(lookup("八年级附录")["id"])
        if p["code"] in ("SHC038", "SHC040", "SHC054"):
            p["node_ids"].append(lookup("九年级附录")["id"])
    data = dict(
        seed_key="shanghai-textbook-original-v1",
        catalog=nodes,
        subject_id=c["subjects"][0]["id"],
        review_status="pending",
        points=points,
        sources=[
            {
                "title": "教育部2022版课程方案和标准通知",
                "url": "https://hudong.moe.gov.cn/srcsite/A26/s8001/202204/t20220420_619921.html",
                "status": "发布依据；官方PDF访问不稳定，未逐页核实教材内容",
            },
            {
                "title": "高教社2022版化学课标解读目录",
                "url": "https://xuanshu.hep.com.cn/front/book/findBookDetails?bookId=62bc92af938b7cc2960eecc9",
                "status": "已核对五学习主题；只用作教学范围参考，非本种子逐题权威背书",
            },
            {
                "title": "项目现有上海六主题目录",
                "file": "catalog-snapshot.json",
                "status": "数据库实际读取；继承已有目录核实限制，不改目录",
            },
        ],
    )
    (ROOT / "content.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    )
    print(len(points), sum(len(p["questions"]) for p in points))


if __name__ == "__main__":
    build()
