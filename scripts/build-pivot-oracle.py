"""Offline pandas oracle. Product code and normal tests do not import pandas."""
import json
import random
from pathlib import Path
import pandas as pd

rng = random.Random(20261029)
records = []
for case, (rows, groups) in enumerate([(2, 2), (3, 3), (8, 3), (12, 11), (80, 6), (20, 4), (5, 7), (40, 5)]):
    source = [[f'r{i}', f'g{j}', '' if (i+j) % 13 == 0 else '0' if (i+j) % 7 == 0 else f'{rng.uniform(-4, 10):.5f}', 'kept'] for i in range(rows) for j in range(groups) if case == 4 or i == 0 or j == 0 or rng.random() > .25]
    rng.shuffle(source)
    frame = pd.DataFrame(source, columns=['Run', 'Method', 'Value', 'Context'])
    row_names, group_names = pd.unique(frame['Run']), pd.unique(frame['Method'])
    values = frame.pivot(index='Run', columns='Method', values='Value').reindex(index=row_names, columns=group_names)
    ids = frame.assign(source_id=range(len(frame))).pivot(index='Run', columns='Method', values='source_id').reindex(index=row_names, columns=group_names)
    records.append({'name': f'pandas-{rows}x{groups}', 'sourceRows': source, 'expected': {
        'columns': ['Run', *group_names.tolist()],
        'rows': [[name, *values.loc[name].fillna('').tolist()] for name in row_names],
        'sourceRows': [[None if pd.isna(v) else int(v) for v in ids.loc[name]] for name in row_names],
        'blankValues': sum(row[2] == '' for row in source),
        'absentCells': int(ids.isna().sum().sum()),
    }})
# A separate MultiIndex pivot verifies value/error pairing and source row IDs.
source = [
    ['D1','S','Base','fp16','76','0.5','keep'],
    ['D1','S','Ours','fp16','8.2e1','0.4','keep'],
    ['D2','S','Base','fp16','78','0.6','keep'],
    ['D2','S','Ours','fp16','','','explicit blank'],
    ['D1','L','Base','fp16','0','0','zero'],
]
fields = ['Dataset','Model','Method','Mode','Accuracy (%)','SE (%)','Note']
frame = pd.DataFrame(source, columns=fields)
row_keys = list(dict.fromkeys(map(tuple, frame[['Dataset','Model']].to_numpy().tolist())))
group_keys = list(dict.fromkeys(map(tuple, frame[['Method','Mode']].to_numpy().tolist())))
index = pd.MultiIndex.from_tuples(row_keys, names=['Dataset','Model'])
columns = pd.MultiIndex.from_tuples(group_keys, names=['Method','Mode'])
def pivot(field):
    return frame.pivot(index=['Dataset','Model'], columns=['Method','Mode'], values=field).reindex(index=index, columns=columns)
value, error = pivot('Accuracy (%)'), pivot('SE (%)')
ids = frame.assign(source_id=range(len(frame))).pivot(index=['Dataset','Model'], columns=['Method','Mode'], values='source_id').reindex(index=index, columns=columns)
names = [' · '.join(key) for key in group_keys]
wide_columns = ['Dataset · Model', *[name for group in names for name in (group, group+' · err')]]
wide_rows, source_rows = [], []
for i,key in enumerate(row_keys):
    cells, rows = [], []
    for j in range(len(group_keys)):
        cells.extend(['' if pd.isna(value.iloc[i,j]) else value.iloc[i,j], '' if pd.isna(error.iloc[i,j]) else error.iloc[i,j]])
        row = None if pd.isna(ids.iloc[i,j]) else int(ids.iloc[i,j])
        rows.extend([row,row])
    wide_rows.append([' · '.join(key), *cells]); source_rows.append(rows)
composite = [{'name':'pandas-multiindex-paired-errors','sourceColumns':fields,'sourceRows':source,'operation':{'kind':'pivot','rowColumns':['c0','c1'],'groupColumns':['c2','c3'],'valueColumn':'c4','errorColumn':'c5'},'expected':{'columns':wide_columns,'rows':wide_rows,'sourceRows':source_rows,'sourceColumns':[4,5,4,5],'blankValues':1,'blankErrors':1,'absentCells':1}}]
target = Path(__file__).resolve().parents[1] / 'src/core/fixtures/pivot-oracle.json'
target.write_text(json.dumps({'oracle': 'pandas.DataFrame.pivot; first-seen single/MultiIndex labels and explicit error pairs', 'pandasVersion': pd.__version__, 'seed': 20261029, 'cases': records, 'compositeCases':composite}, indent=2) + '\n')
print(f'{len(records)} single-key and {len(composite)} composite cases, pandas {pd.__version__}: {target}')
