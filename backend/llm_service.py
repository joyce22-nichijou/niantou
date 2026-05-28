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
            f'  "summary": "用 10 字以内总结这个念头"\n'
            f'}}\n\n'
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
            "summary": "未能解析",
        }
