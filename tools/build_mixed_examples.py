"""Generate stored mixed Chinese/English examples; no runtime matching is needed."""
import json
import re
from pathlib import Path

# Rewritten contexts for translations whose wording differs from the glossary.
EXAMPLES = {
    "justify": "现有证据不足以 justify 这一结论。",
    "accessible": "公共建筑应当对轮椅使用者同样 accessible。",
    "peer": "来自 peer 的反馈可以帮助我们发现论证中的不足。",
    "demographic": "这份 demographic 调查记录了当地人口的年龄结构。",
    "fertility": "长期使用有机肥有助于提高土壤的 fertility。",
    "regulation": "严格的 regulation 可以保护消费者免受虚假宣传的影响。",
    "controversial": "由于社会成本过高，这项提案仍然十分 controversial。",
    "affordable": "政府需要提供更多普通家庭也觉得 affordable 的住房。",
    "wellbeing": "附近的绿地有助于改善居民的 wellbeing。",
    "congress": "来自各地的代表将在本次 congress 上讨论教育政策。",
    "tough": "对资金不足的小企业来说，今年将是 tough 的一年。",
    "contribute": "私人花园也能为保护城市生物多样性 contribute 一份力量。",
    "annual": "公司的 annual 报告详细介绍了这一年的环保成果。",
    "commitment": "她对教育事业的 commitment 让她坚持支教十年。",
    "regional": "加强 regional 合作可以改善周边城市之间的交通。",
    "faculty": "工程 faculty 新开设了几门可再生能源课程。",
    "massive": "修建这条铁路需要 massive 的资金投入。",
    "expose": "记者决定 expose 这家公司长期隐瞒的污染问题。",
    "perceive": "不同的人可能以不同方式 perceive 同一种风险。",
    "consist": "这门课程将 consist of 讲座和实践研讨课两部分。",
    "resistance": "居民的 resistance 推迟了新收费政策的实施。",
    "intense": "市场上的竞争十分 intense，企业必须不断改进产品。",
    "inspire": "这次科学演示可能 inspire 孩子们探索自然的兴趣。",
    "visible": "河水变清后，生态修复的效果已经十分 visible。",
    "dominate": "少数大型企业逐渐 dominate 了国内市场。",
    "transfer": "银行需要两天才能把这笔资金 transfer 到国外账户。",
    "disorder": "长期失眠可能是一种需要治疗的睡眠 disorder。",
    "veteran": "这位行业 veteran 为刚创业的年轻人提供了实用建议。",
    "dimension": "这份报告分析了经济变化的社会 dimension。",
    "publication": "研究结果在正式 publication 之前经过了仔细审查。",
    "assure": "经理向员工 assure，公司会认真处理他们的担忧。",
    "universal": "获得干净饮用水应当是一项 universal 的权利。",
    "expansion": "机场的 expansion 增加了周边道路的交通量。",
    "tremendous": "这项发现引起了医学研究人员 tremendous 的兴趣。",
    "considerable": "新系统帮助公司节省了 considerable 的费用。",
    "intellectual": "阅读和讨论可以促进孩子的 intellectual 发展。",
    "characterise": "开放和互信是可以用来 characterise 这个团队的特点。",
    "elderly": "这项服务帮助 elderly 居民保持独立生活。",
    "distinction": "研究者必须弄清相关性与因果关系之间的 distinction。",
    "segment": "这个市场 segment 对价格变化尤其敏感。",
    "vessel": "这艘科研 vessel 将前往深海采集样本。",
    "storage": "更好的能源 storage 技术可以提高供电的稳定性。",
    "vulnerable": "这项政策为最 vulnerable 的家庭提供额外支持。",
    "frequency": "提高公交车的发车 frequency 可以减少乘客等待时间。",
    "qualify": "申请者必须完成培训，才能 qualify for 这个职位。",
    "derive": "研究人员应从可靠证据中 derive 结论。",
    "conviction": "她坚信教育能够改变人生，这份 conviction 支撑她多年从事志愿工作。",
    "ratio": "这所学校的师生 ratio 是一比二十。",
    "anticipate": "企业必须提前 anticipate 消费者需求的变化。",
    "orientation": "新生可以通过 orientation 活动了解学校的服务。",
    "impressive": "新设计的节能效果十分 impressive。",
    "portray": "这部纪录片试图真实地 portray 偏远村庄的生活。",
    "subsequent": "subsequent 研究证实了最初发现的重要性。",
    "margin": "原材料涨价使公司的利润 margin 变小了。",
    "attribute": "我们不能把所有变化都 attribute to 同一个原因。",
    "decrease": "节水措施实施后，城市用水量开始 decrease。",
    "entitle": "这张会员卡会 entitle 持有人免费使用共享设施。",
    "render": "这次软件更新可能 render 旧设备无法正常使用。",
    "consult": "改变公共空间之前，规划者应先 consult 当地居民。",
    "drift": "塑料垃圾可能随洋流 drift 到很远的地方。",
    "drain": "工人挖了一条沟，让积水可以顺利 drain 出去。",
    "minimum": "这项政策规定了住房质量必须达到的 minimum 标准。",
    "particle": "一颗微小的塑料 particle 也可能进入食物链。",
    "trait": "好奇心是科学研究者身上一种重要的 trait。",
    "exclusive": "这家公司获得了该产品的 exclusive 销售权。",
    "scatter": "强风会把种子 scatter 到周围的土地上。",
    "residence": "旧工厂已经被改造成学生的 residence。",
    "counterpart": "这所城市学校比它在农村的 counterpart 拥有更多资源。",
    "spectrum": "调查收集了来自不同年龄人群的广泛意见，覆盖了完整的观点 spectrum。",
    "reluctant": "一些雇主对投资陌生技术仍然感到 reluctant。",
    "recipient": "每位资助 recipient 都会收到一份资金使用指南。",
    "productive": "安静的环境能让员工的工作更加 productive。",
    "dynamic": "一个 dynamic 的经济体会不断为新企业创造机会。",
    "undertake": "研究团队将 undertake 一项详细调查。",
    "specialise": "学生可以在第二学年开始 specialise in 环境政策。",
    "dilemma": "这座城市面临发展经济与保护环境之间的 dilemma。",
    "liability": "合同明确规定了设备损坏时双方各自的 liability。",
    "hostile": "充满敌意的同事让工作环境变得十分 hostile。",
    "revelation": "有关资金去向的 revelation 促使公司展开内部调查。",
    "costly": "推迟维护可能让未来的维修变得更加 costly。",
    "ambitious": "这座城市制定了一个 ambitious 的减排目标。",
    "insert": "作者应在论证需要支撑的地方 insert 一个具体例子。",
    "minimal": "这栋建筑的设计目标是让它对环境的影响保持 minimal。",
    "donation": "这笔 donation 将帮助图书馆购买新设备。",
    "comprise": "调查样本将 comprise 来自不同收入群体的家庭。",
    "placement": "毕业前的工作 placement 帮助学生把课堂知识用于实践。",
}


def mixed_example(item):
    if item["word"] in EXAMPLES:
        return EXAMPLES[item["word"]]
    meanings = [part.strip() for part in re.split(r"[；;，,、/／|\n]+", item["zh"])]
    candidates = {candidate for meaning in meanings for candidate in (meaning, meaning.removesuffix("的")) if candidate}
    matches = sorted((part for part in candidates if part in item["cn"]), key=lambda part: (-len(part), part))
    if not matches:
        raise ValueError(f"Write a mixed example for {item['word']}")
    return item["cn"].replace(matches[0], f" {item['word']} ", 1).strip()


if __name__ == "__main__":
    path = Path(__file__).resolve().parents[1] / "games/daily-english.js"
    header, body = path.read_text(encoding="utf-8").split(" = ", 1)
    bank = json.loads(body.strip().removesuffix(";"))
    for item in bank:
        item["mixedExample"] = mixed_example(item)
    path.write_text(header + " = " + json.dumps(bank, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
    print(f"Saved {len(bank)} mixed examples")
