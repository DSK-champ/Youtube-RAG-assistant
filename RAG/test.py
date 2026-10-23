from langchain_ollama import ChatOllama

model = ChatOllama(
    model="qwen3.5",
    temperature=0,    
    reasoning=False,  # <--------------- reasoning is false ebcause its taking TOOO long to respond 
    num_predict=128,  # <--------------- max number of tokens the model can generate so simple answers are kept simple insstead of over complicating things
)

response = model.invoke("hello")
print(response.content)