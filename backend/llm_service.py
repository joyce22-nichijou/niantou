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
