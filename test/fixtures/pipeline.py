from kfp import dsl


@dsl.component(base_image='python:3.11')
def produce() -> str:
    return 'hello'


@dsl.component(base_image='python:3.11')
def consume(text: str) -> str:
    return text.upper()


@dsl.pipeline
def inner_pipeline(text: str) -> str:
    transformed = consume(text=text)
    return transformed.output


@dsl.pipeline
def demo_pipeline():
    first = produce()
    nested = inner_pipeline(text=first.output)
    final = consume(text=nested.output)
    final.after(first)
