"""Generate test documents for benchmark."""
import os

TEST_DIR = os.path.join(os.path.dirname(__file__), '..', 'backend', 'data', 'tmp', 'bench')
os.makedirs(TEST_DIR, exist_ok=True)

def generate_markdown(target_bytes):
    """Generate markdown content approximately target_bytes in size."""
    section_tpl = """
## Section {s} - Structure-Property Relationships in Advanced Materials

This section explores the intricate relationships between microstructural features
and macroscopic properties in engineering materials. The structure-property paradigm
forms the cornerstone of modern materials science and engineering design.

### {s}.1 Microstructural Characterization

| Property | Value | Unit | Method |
|----------|-------|------|--------|
| Grain Size | 12.5 | um | EBSD |
| Hardness | 320 | HV | Vickers |
| Yield Strength | 450 | MPa | Tensile |
| Toughness | 85 | MPa.m1/2 | SENB |

```python
# Structure-property correlation analysis
import numpy as np
from sklearn.linear_model import LinearRegression

def hall_petch(sigma_0, k_y, d):
    return sigma_0 + k_y / np.sqrt(d)
```

The microstructural features exhibit significant influence on the overall mechanical
response, particularly under cyclic loading conditions where grain boundary character
plays a pivotal role in crack initiation and propagation resistance.

"""
    filler = ("Additional filler text for benchmark size calibration. " * 10 + "\n") * 5

    content = ""
    s = 1
    while len(content.encode('utf-8')) < target_bytes:
        content += section_tpl.format(s=s)
        content += filler
        s += 1

    return content

def generate_html(target_bytes):
    """Generate HTML content from markdown."""
    md = generate_markdown(target_bytes)
    # Simple markdown-to-HTML conversion for the main elements
    html_body = md.replace('## ', '<h2>').replace('### ', '<h3>').replace('\n\n', '</p>\n<p>')
    html_body = '<p>' + html_body.replace('\n', '<br>\n') + '</p>'

    return """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Materials Science Technical Report</title>
    <style>
        body {{ font-family: 'Segoe UI', sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }}
        h2 {{ color: #2c3e50; border-bottom: 2px solid #3498db; }}
        table {{ border-collapse: collapse; width: 100%; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
        th {{ background-color: #3498db; color: white; }}
    </style>
</head>
<body>
<h1>Materials Science Technical Report</h1>
{}
</body>
</html>""".format(html_body)

def generate_text(target_bytes):
    """Generate plain text content."""
    md = generate_markdown(target_bytes)
    # Strip markdown formatting
    for char in '#*`|[]()':
        md = md.replace(char, '')
    return md


sizes = [
    (5_000, '5kb'),
    (50_000, '50kb'),
    (200_000, '200kb'),
]

for target, label in sizes:
    for fmt, ext, gen_func in [
        ('md', '.md', generate_markdown),
        ('txt', '.txt', generate_text),
        ('html', '.html', generate_html),
    ]:
        path = os.path.join(TEST_DIR, f'bench_{label}{ext}')
        content = gen_func(target)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        actual_kb = os.path.getsize(path) / 1024
        print(f'Created: {os.path.basename(path):25s}  target={label:5s}  actual={actual_kb:.1f} KB  format={fmt}')

print(f'\nAll test files in: {TEST_DIR}')
