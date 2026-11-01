"""Offline numerical oracle. NumPy is not a FastFigure runtime dependency."""
import json
import random
from pathlib import Path
import numpy as np

cases = [
    ('even-outlier', [20, 3, 0, 6, None, 2, 1, 5, 4]),
    ('odd', [9, 1, 5, 3, 7]),
    ('constant', [4] * 10),
    ('zero-iqr-outlier', [0, 0, 0, 0, 0, 0, 0, 6]),
    ('inclusive-fence', [0, 1, 2, 3, 4, 5, 6, 10.5]),
    ('two-sided-outliers', [-20, -2, -1, 0, 0, 1, 2, 20]),
    ('two-samples', [1, 9, None]),
    ('three-samples', [0, 7, 2]),
    ('tiny-values', [-1e-12, 0, 1e-12, 2e-12, 9e-12]),
    ('large-values', [-1e12, -1e11, 0, 1e11, 1e12]),
]
rng = random.Random(20261029)
for i in range(32):
    n = [2, 3, 4, 7, 8, 12, 20, 40, 80][i % 9]
    values = [None if j > 1 and rng.random() < .12 else round(rng.gauss(i - 15, 2), 6) for j in range(n)]
    if i % 3 == 0:
        values[-1] = round(i + 25.5, 6)
    cases.append((f'fixed-random-{i}', values))

records = []
for name, values in cases:
    present = np.array([x for x in values if x is not None], dtype=np.float64)
    q1, median, q3 = np.quantile(present, [.25, .5, .75], method='linear')
    lo, hi = q1 - 1.5 * (q3 - q1), q3 + 1.5 * (q3 - q1)
    inside = present[(present >= lo) & (present <= hi)]
    records.append({'name': name, 'values': values, 'expected': {
        'n': int(present.size), 'missing': len(values) - int(present.size),
        'min': float(present.min()), 'q1': float(q1), 'median': float(median),
        'q3': float(q3), 'max': float(present.max()),
        'whiskerLow': float(inside.min()), 'whiskerHigh': float(inside.max()),
        'outlierIndices': [i for i, value in enumerate(values) if value is not None and (value < lo or value > hi)]
    }})
target = Path(__file__).resolve().parents[1] / 'src/core/fixtures/boxplot-oracle.json'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps({'oracle': 'numpy.quantile(method="linear")', 'numpyVersion': np.__version__, 'seed': 20261029, 'cases': records}, indent=2, allow_nan=False) + '\n')
print(f'{len(records)} oracle cases, NumPy {np.__version__}: {target}')
