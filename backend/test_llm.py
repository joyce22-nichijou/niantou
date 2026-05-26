from llm_service import LLMService

service = LLMService(provider="glm")
reply = service.chat([{"role": "user", "content": "用一句话告诉我你是谁"}])
print(reply)
