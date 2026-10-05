# 连续岩棚 · 第二轮

第一目标是用户认可的、可自由观察的纪录片式浅海礁区可运行样片。当前这一小步把三块拱门改为一侧连续岩棚与偏侧窄隙，已完成两次造型并停止；[实际对比样片](../output/validation/reef-shelf-review-round-2.html)及[收据](../output/validation/reef-shelf-visual-round-2.json)供用户审阅。全景中三块拼接已消除，西侧敞开可见改善；表面仍偏光滑、生物覆盖不足，整体纪录片效果未达标。user acceptance pending，大Goal工具paused，不继续v3。

[v1 quick](../output/validation/reef-continuous-ledge-v1.json) passed=false：棚底解析／三角面最大差178.495mm；[v1动物检查](../output/validation/reef-continuous-ledge-animal-points-v1.json)还记录95次岩7上下表面倒序引起的区间不可判定，并非95只动物穿入。v2把西侧凹蚀完全开放、向东以C2过渡接海床，略压低并偏置右肩；7上下均真正埋在床下45mm以上，8只剩低后碎块。[v2 quick](../output/validation/reef-continuous-ledge-v2.json)有限通过：28其他buffer原字节保持，31岩127,744面，仅9采样96×80；1872个排序点无倒序，432实际高度点upper差−0.850..+1.161mm、lower最大绝对差4.289mm，105通道点最小actual gap71.040mm，30条前后实际射线无碰撞。旧中心／两支柱接盖契约明确终止，失败报告与基线保留。

[v2动物检查](../output/validation/reef-continuous-ledge-animal-points-v2.json)在seed1／42／2026各30模拟秒的有限root／鼻尾／body-bottom代理上通过，实际landmark和proxy穿入、不可判定均为0；底栖root未命中实际岩面列。它不是whole-body或连续扫掠验证、长期耐久、完整机制验证，也不是生态A/B。此轮改变共享硬底，初始化高度及后续轨迹可能改变；旧长期生态结果只覆盖其记录版本。

当前terrain／habitat SHA分别为920e9657fd45d8b91d89ba7791c54723b569116ca831d7ca14cf23b30f430182／d82568f9c727b967dc761e2dedf5dc1f30f3d0f34659c66d2ead1b56a2495397，仍与v2报告一致。另有必要的World岩隙preset一行相机修订；动物-v2完整World SHA仍为旧09c2897e…7daff，不能称其所有绑定文件都是最新。本轮收据记录World恰好只替换这一行，updateOrganism方法字节hash仍与动物报告相同，并保存修订后的新构建；不把相机改动伪装成完整World重新验证。当前只等用户视觉审阅，后续按岩体→代表珊瑚形态／材质→环境构图与水下光照→已有行为／操作体验核验→同版整体交付推进。
