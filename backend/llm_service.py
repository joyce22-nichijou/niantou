import json
import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()


class LLMService:
    def __init__(self, provider: str = "glm"):
        self.provider = provider

    def chat(self, messages: list[dict], model: str = None) -> str:
        if self.provider == "glm":
            return self._chat_glm(messages, model)
        elif self.provider == "claude":
            # 未来接入：使用 anthropic 库，claude-haiku-4-5
            # from anthropic import Anthropic
            # client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
            # response = client.messages.create(model=model or "claude-haiku-4-5", ...)
            raise NotImplementedError("Claude provider not yet implemented")
        elif self.provider == "deepseek":
            # 未来接入：DeepSeek 也走 OpenAI 兼容协议
            # base_url="https://api.deepseek.com/v1", api_key=os.getenv("DEEPSEEK_API_KEY")
            raise NotImplementedError("DeepSeek provider not yet implemented")
        else:
            raise ValueError(f"Unknown provider: {self.provider}")

    def _chat_glm(self, messages: list[dict], model: str = None) -> str:
        client = OpenAI(
            api_key=os.getenv("GLM_API_KEY"),
            base_url="https://open.bigmodel.cn/api/paas/v4",
        )
        response = client.chat.completions.create(
            model=model or "glm-4-flash",
            messages=messages,
        )
        return response.choices[0].message.content

    def extract_thought_info(self, text: str) -> dict:
        """从用户说的一句话中提取结构化信息，返回 dict。"""
        system_msg = "你是一个帮助理解用户念头的助手，只输出 JSON，不要任何解释文字。"
        user_msg = (
            f"分析以下念头，严格返回如下 JSON 格式（不要 markdown 代码块，直接输出花括号）：\n"
            f'{{\n'
            f'  "activity_type": "从 出门/创作/学习/社交/消费/联络/其他 中选一个",\n'
            f'  "location_hint": "地点相关信息，没有则为 null",\n'
            f'  "emotion_color": "从 兴奋/好奇/平静/低落/焦虑/中性 中选一个",\n'
            f'  "time_relevance": "从 当下/工作日/周末/夜晚/任意 中选一个",\n'
            f'  "scene": "outdoor 或 indoor 或 either",\n'
            f'  "summary": "用 10 字以内总结这个念头"\n'
            f'}}\n\n'
            f"scene 字段说明（必须准确判断）：\n"
            f"- outdoor：必须出门才能做。例：看展览、爬山、逛市集、去图书馆、散步、逛街、去面包店\n"
            f"- indoor：在家即可完成。例：读书、整理照片、打电话、发消息、写毛笔字、玩游戏\n"
            f"- either：室内外均可，或完全无法判断\n\n"
            f"念头：{text}"
        )

        if self.provider == "glm":
            client = OpenAI(
                api_key=os.getenv("GLM_API_KEY"),
                base_url="https://open.bigmodel.cn/api/paas/v4",
            )
            try:
                response = client.chat.completions.create(
                    model="glm-4-flash",
                    messages=[
                        {"role": "system", "content": system_msg},
                        {"role": "user", "content": user_msg},
                    ],
                    response_format={"type": "json_object"},
                )
                raw = response.choices[0].message.content
                return json.loads(raw)
            except json.JSONDecodeError as e:
                print(f"[警告] GLM 返回了非合法 JSON，将使用默认值。错误：{e}")
                return self._default_extracted_info()
            except Exception as e:
                print(f"[警告] extract_thought_info 调用异常，将使用默认值。错误：{e}")
                return self._default_extracted_info()
        else:
            raise NotImplementedError(f"extract_thought_info 尚未支持 provider: {self.provider}")

    def _default_extracted_info(self) -> dict:
        return {
            "activity_type": "其他",
            "location_hint": None,
            "emotion_color": "中性",
            "time_relevance": "任意",
            "scene": "either",
            "summary": "未能解析",
        }

    def detect_state_scene(self, user_state: str) -> str | None:
        """
        轻量判断用户状态隐含的场景倾向，用于邀请前的硬过滤。
        返回 "outdoor"、"indoor"，或 None（不明确，不过滤）。
        """
        if self.provider != "glm":
            return None

        system_msg = "你是一个分析用户意图的助手，只输出 JSON，不要任何解释文字。"
        user_msg = (
            f'判断以下用户状态，选择最合适的 scene 值，返回 JSON：\n'
            f'{{\n'
            f'  "scene": "outdoor 或 indoor 或 none"\n'
            f'}}\n\n'
            f'规则：\n'
            f'- outdoor：明确想出门、想走走、想动、坐不住、想逛、想爬山等\n'
            f'- indoor：明确没精力、想宅着、不想出门、想安静、想在家做点小事\n'
            f'- none：模糊、不确定、或两者都行（如"有点闷""随便""不知道干嘛"）\n\n'
            f'用户状态："{user_state}"'
        )

        client = OpenAI(
            api_key=os.getenv("GLM_API_KEY"),
            base_url="https://open.bigmodel.cn/api/paas/v4",
        )
        try:
            response = client.chat.completions.create(
                model="glm-4-flash",
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_msg},
                ],
                response_format={"type": "json_object"},
            )
            raw = response.choices[0].message.content
            scene = json.loads(raw).get("scene", "none")
            return scene if scene in ("outdoor", "indoor") else None
        except Exception as e:
            print(f"[警告] detect_state_scene 调用失败，将不过滤。错误：{e}")
            return None

    def generate_invitation(
        self,
        candidates: list[dict],
        user_state: str,
        now_info: dict,
    ) -> dict | None:
        """
        从候选念头中选一个，生成朋友口吻的邀请话术。

        candidates 每项包含：id, summary, location_hint, time_relevance, created_at
        user_state：用户说的当前状态，如"有点闷"
        now_info：{"weekday": "周三", "hour": 15, "is_daytime": True}

        用一次 AI 调用完成：
        1. 判断用户能量档位（A=低能量 / B=情绪尚可）
        2. 从候选中选出最匹配的念头
        3. 按档位语气生成邀请（≤2句，朋友口吻）

        返回 {"energy_level": "A"|"B", "chosen_thought_id": int, "invitation": str}
        候选为空时返回 None；JSON 解析失败时返回默认结构。
        """
        if not candidates:
            return None

        system_msg = (
            "你是用户的一个懂他的老朋友，说话随意自然，不是客服也不是教练。"
            "只输出 JSON，不要任何解释文字。"
        )

        candidates_text = "\n".join(
            f'- id={c["id"]}  摘要：{c["summary"]}'
            f'  地点：{c["location_hint"] or "无"}  时间相关：{c["time_relevance"]}'
            for c in candidates
        )

        user_msg = f"""当前时间：{now_info.get("weekday", "")} {now_info.get("hour", "")}点，{"白天" if now_info.get("is_daytime") else "晚上"}
用户状态："{user_state}"

候选念头列表：
{candidates_text}

请完成以下三件事，返回 JSON：

【第一步：判断用户能量档位】
- 档位A「低能量」：明确表达疲惫、累、没劲、提不起精神、情绪低落、丧。
- 档位B「情绪尚可」：无聊、闷、烦、坐不住、不知道干嘛、想找点事做。
- 注意："有点闷""无聊""烦""想出门""想动一动"都属于 B。只有明确说"累""没精力""提不起劲""不想动"才是 A。

【第二步：选念头——必须和状态性质对应】
- 如果状态暗示「想出门、想走走、想动一动」→ 只能选需要外出的念头（如看展览、去图书馆、散步），绝不能选打电话、读书这类室内事。
- 如果状态暗示「没精力、想宅着、做点小事」→ 优先选在家就能做、低成本的念头（如打电话、读几页书）。
- 如果状态没有明确方向（如"有点闷"）→ 综合时间和念头新鲜度自由选择。
- 选错性质（比如想出门却让人打电话）是最严重的错误，务必避免。

【第三步：生成邀请话术】
重要：下面每一档都给了多个示例，它们的开头、句式、长短都故意不一样。请只用它们来体会"语气的感觉"，严禁套用任何一个示例的开头、句式或词语，每次都要重新组织全新的语言。

- 档位A → 温和型：像一个安静的朋友轻声提议，节奏慢，不施压，优先低决策成本的念头。
  以下示例开头分别从天气/感受/念头/否定切入，句式各不相同（仅供体会语气，禁止套用）：
  · "天气挺好的，你不是想去图书馆借乐器吗，走几分钟就到，去坐坐？"
  · "不用勉强出门也行——给妈妈打个电话，聊两句也挺好。"
  · "那本书还安静地搁在那儿呢，翻几页，不想看就放下。"
  · "今天就慢一点吧，要不去公园晒晒太阳，什么都不用想。"

- 档位B → 好奇引导型：给一个具体的、诱人的未来画面，让人提前尝到做完这件事的"正反馈"，从而想去亲手实现。
  关键：画面要具体（不说"会很有趣"，而说出具体的好东西）、要正向（愉悦或有收获）、用"也许/说不定"留有想象余地。
  以下示例开头分别从念头/外部信息/感受/环境切入，句式各不相同（仅供体会语气，禁止套用）：
  · "图书馆借乐器那个——说不定有吉他、有电钢琴，借一把回来瞎弹一晚上，想想就挺爽。"
  · "那个新展览听说有幅特别神的画，看完没准给你点灵感呢？"
  · "你那本书我猜翻开就停不下来——好久没体验过被一个故事带走一下午了吧。"
  · "外面天这么好，公园那边没准有点意外的小惊喜，溜达一圈？"

【通用要求】
- 像懂你的朋友随口一说，不超过两句话。
- 可以带具体细节（地点、距离、时间）增加真实感。
- 严禁：客服腔（"建议您""为了…"）、过度热情（"亲~""哦耶"）、说教感、复用上面任何示例的原话或句式。

返回格式（直接输出花括号，不要 markdown 代码块）：
{{
  "energy_level": "A 或 B",
  "chosen_thought_id": 数字,
  "invitation": "邀请话术"
}}"""

        if self.provider == "glm":
            client = OpenAI(
                api_key=os.getenv("GLM_API_KEY"),
                base_url="https://open.bigmodel.cn/api/paas/v4",
            )
            try:
                response = client.chat.completions.create(
                    model="glm-4-flash",
                    messages=[
                        {"role": "system", "content": system_msg},
                        {"role": "user", "content": user_msg},
                    ],
                    response_format={"type": "json_object"},
                )
                raw = response.choices[0].message.content
                return json.loads(raw)
            except json.JSONDecodeError as e:
                print(f"[警告] generate_invitation JSON 解析失败，使用默认值。错误：{e}")
                return self._default_invitation(candidates)
            except Exception as e:
                print(f"[警告] generate_invitation 调用异常，使用默认值。错误：{e}")
                return self._default_invitation(candidates)
        else:
            raise NotImplementedError(f"generate_invitation 尚未支持 provider: {self.provider}")

    def _default_invitation(self, candidates: list[dict]) -> dict:
        first_id = candidates[0]["id"] if candidates else 0
        return {
            "energy_level": "B",
            "chosen_thought_id": first_id,
            "invitation": "你之前有个念头，要不要去试试看？",
        }
