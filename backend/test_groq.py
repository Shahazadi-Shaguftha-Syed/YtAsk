import os
from groq import Groq

client = Groq(api_key=os.environ["GROQ_API_KEY"])

resp = client.chat.completions.create(
    model="openai/gpt-oss-20b",
    messages=[{"role": "user", "content": "say hi in one line"}],
)
print(resp.choices[0].message.content)