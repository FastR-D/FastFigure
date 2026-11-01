/** Shared strict CSV/TSV reader; no numeric coercion, aggregation or dropped nonempty rows. */
export function parseDelimitedTable(text:string,maxRows=20):string[][]{
  if(text.length>20_000)throw new Error('数据文本最多 20,000 字符')
  const input=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/^\n+|\n+$/g,'')
  if(!input.trim())throw new Error('请粘贴包含表头的数据')
  let quoted=false,delimiter=','
  for(const c of input){if(c==='"')quoted=!quoted;if(!quoted&&c==='\t'){delimiter='\t';break}if(!quoted&&c==='\n')break}
  const rows:string[][]=[];let row:string[]=[],cell='',inside=false,closed=false
  for(let i=0;i<=input.length;i++){
    const c=input[i]
    if(inside){if(c===undefined)throw new Error('CSV 引号没有闭合');if(c==='"'){if(input[i+1]==='"'){cell+='"';i++}else{inside=false;closed=true}}else cell+=c;continue}
    if(c===delimiter||c==='\n'||c===undefined){row.push(cell.trim());cell='';closed=false;if(c!==delimiter){if(row.some(v=>v!=='')||row.length>1)rows.push(row);row=[];if(rows.length>maxRows+1)throw new Error(`最多 ${maxRows} 行数据`)}continue}
    if(c==='"'){if(cell.trim()||closed)throw new Error('CSV 引号须包围完整单元格');inside=true;continue}
    if(closed&&!/\s/.test(c))throw new Error('CSV 引号后只能是分隔符')
    cell+=c
  }
  if(rows.length<3)throw new Error('需要一行表头和至少两行数据')
  return rows
}
