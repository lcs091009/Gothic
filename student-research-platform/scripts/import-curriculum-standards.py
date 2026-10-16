"""Import official MOE curriculum ZIPs; PDF: PyMuPDF, HWP: olefile.
Usage: python scripts/import-curriculum-standards.py 2022 /tmp/curriculum2022.zip
Source URLs and archive hashes are recorded in the generated metadata.
Only high-school course headings and first occurrences of achievement standards
are imported. The resulting areas are national curriculum domains, NOT a
publisher's large/middle/small textbook-unit hierarchy.
"""
import sys,re,json,zipfile,hashlib,struct,zlib,pathlib
revision,archive=sys.argv[1:3]
out=pathlib.Path('src/data/curriculumStandards')
url='https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=141&boardSeq='+('93458' if revision=='2022' else '60747')+'&lev=0'
def hwp_text(blob):
 import olefile,io
 o=olefile.OleFileIO(io.BytesIO(blob));compressed=bool(o.openstream('FileHeader').read()[36]&1);parts=[]
 for path in sorted(o.listdir()):
  if path[0]!='BodyText' or not path[-1].startswith('Section'):continue
  data=o.openstream(path).read();data=zlib.decompress(data,-15) if compressed else data;i=0
  while i+4<=len(data):
   h=struct.unpack_from('<I',data,i)[0];i+=4;tag=h&1023;size=h>>20
   if size==4095:size=struct.unpack_from('<I',data,i)[0];i+=4
   if tag==67:
    raw=data[i:i+size];j=0;chars=[]
    while j+2<=len(raw):
     code=struct.unpack_from('<H',raw,j)[0]
     if code<32 and code not in [10,13]:j+=16 if code in range(1,24) else 2;continue
     chars.append(raw[j:j+2]);j+=2
    parts.append(b''.join(chars).decode('utf-16le','ignore'))
   i+=size
 return '\n'.join(parts)
z=zipfile.ZipFile(archive);courses=[]
for name in z.namelist():
 try:label=name.encode('cp437').decode('cp949')
 except:label=name
 number=re.search(r'별책\s*(\d+)',label)
 if not number or not 5<=int(number[1])<=14:continue
 if name.endswith('.hwp'):text=hwp_text(z.read(name))
 elif name.endswith('.pdf'):
  import fitz
  doc=fitz.open(stream=z.read(name),filetype='pdf');text='\n'.join(p.get_text() for p in doc)
 else:continue
 lines=[re.sub(r'\s+',' ',re.sub(r'[\x00-\x1f\x7f]',' ',l)).strip() for l in text.splitlines() if l.strip()];heads=[]
 for i,line in enumerate(lines):
  if not re.match(r'1\.\s*성격',line):continue
  title=lines[i-1]
  if len(title)>35 or not re.fullmatch(r'[가-힣0-9ⅠⅡIII ,·⋅]+',title) or title in ['고등학교','중학교','초등학교']:continue
  heads.append((i,title))
 for n,(start,title) in enumerate(heads):
  end=heads[n+1][0]-1 if n+1<len(heads) else len(lines);part=lines[start:end];standards=[];seen=set();area=''
  for lineindex,line in enumerate(part):
   heading=re.match(r'^\((\d+)\)\s*(.{2,50})$',line)
   if heading:area=heading[2]
   match=re.match(r'^\[(1[02][^\]]{2,20})\]\s*(.+)$',line)
   if not match or match[1] in seen:continue
   # The first occurrence is the criterion; subsequent repetitions are commentary.
   objective=match[2]
   for following in part[lineindex+1:lineindex+9]:
    if objective.rstrip().endswith(('다.','다．')) or re.match(r'^(?:\[|\(|<|[•⋅-]|[가-힣]\.)',following) or len(objective)>1000:break
    objective+=' '+following
   if len(objective)<8:continue
   seen.add(match[1]);standards.append({'code':match[1],'area':area,'objective':objective})
  if not standards:continue
  for course in title.split(','):
   subject_standards=standards
   if ',' in title and course.strip()[-1:] in ['1','2']:
    subject_standards=[s for s in standards if re.match(r'^10[^-]*'+course.strip()[-1]+r'-',s['code'])]
   courses.append({'subject':course.strip(),'revision':revision,'source':url,'sourceFile':label,'standards':subject_standards})
for old in out.glob(revision+'-*.js'):old.unlink()
for i in range(0,len(courses),6):
 (out/f'{revision}-{i//6+1}.js').write_text('export default '+json.dumps(courses[i:i+6],ensure_ascii=False,indent=2)+';\n')
metadata={'revision':revision,'source':url,'archiveSHA256':hashlib.sha256(pathlib.Path(archive).read_bytes()).hexdigest(),'courseCount':len(courses),'criterionCount':sum(len(c['standards']) for c in courses),'coverage':'고교 과목별 국가 성취기준 발췌. 교과서별 대·중·소단원 및 교사 수업 차시 목표는 미포함.'}
(out/f'{revision}-source.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
print(metadata)
