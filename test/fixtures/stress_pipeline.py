from typing import List
from kfp import dsl

@dsl.component
def gen() -> List[str]:
    return ['a']

@dsl.component
def work(x: str) -> str:
    return x

@dsl.component
def cleanup():
    pass

@dsl.component
def flag() -> str:
    return 'x'

@dsl.component
def agg(xs: List[str]) -> str:
    return ''

@dsl.pipeline
def inner(x: str, y: str):
    a = work(x=x)
    b = work(x=y).after(a)

@dsl.pipeline
def stress(p: str = 'v'):
    exit_task = cleanup()
    with dsl.ExitHandler(exit_task):
        g = gen()
        f = flag()
        with dsl.If(f.output == 'x'):
            w = work(x=p)
        with dsl.Else():
            w2 = work(x=p)
        with dsl.ParallelFor(g.output) as item:
            inn = inner(x=item, y=p)
            r = work(x=item)
        agg(xs=dsl.Collected(r.output))
