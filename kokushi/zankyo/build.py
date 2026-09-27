"""src.html に course.json を埋め込んで index.html を作る。python3 course.py && python3 build.py"""
import json, os
d = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(d, 'src.html')).read()
data = json.dumps(json.load(open(os.path.join(d, 'course.json'))), ensure_ascii=False, separators=(',', ':'))
assert '/*COURSE_JSON*/null' in src
open(os.path.join(d, 'index.html'), 'w').write(src.replace('/*COURSE_JSON*/null', data))
print('index.html', len(src) + len(data))
