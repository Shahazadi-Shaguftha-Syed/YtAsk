from rag import ingest, ask

print("chunks:", ingest("EvGkSEuWtaI"))
out = ask("EvGkSEuWtaI", "what is the secret to forming a new habit")
print(out["answer"])
print()
for s in out["sources"]:
    print(s["time"], s["text"][:80])